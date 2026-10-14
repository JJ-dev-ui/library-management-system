const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");
const User = require("../models/User");
const UserAvatar = require("../models/UserAvatar");
const LoginActivity = require("../models/LoginActivity");
const { parseDevice, cleanIp } = require("../utils/userAgent");
const { MEMBER } = require("../utils/limits");
const { THEMES } = require("../utils/themes");
const { imageInfo } = require("../utils/imageInfo");
const { logActivity, memberSnap } = require("../utils/activity");
const { protect } = require("../middleware/auth");
const { validate } = require("../middleware/error");

const router = express.Router();

// Email clean-up: lower-case, but KEEP the dots in Gmail addresses (the default would turn
// "andrea.reyes@gmail.com" into "andreareyes@gmail.com", so the address you typed would not match)
const EMAIL_OPTS = { gmail_remove_dots: false };

// The token carries the user id AND the token version (tv). When the password changes, tokenVersion
// goes up, and every older token is refused by `protect` ("log out other devices").
const signToken = (user) =>
  jwt.sign({ id: user._id, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

// Only safe fields go to the client, never the password or the token version
const userPayload = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  memberId: u.memberId,
  contactNumber: u.contactNumber,
  address: u.address,
  createdAt: u.createdAt,
  avatarKey: u.avatarKey || null,
  preferences: { theme: u.preferences?.theme || "nu-classic" },
});

// Saves "last login" on the user + one LoginActivity row. A failure here is only logged:
// it must never stop a correct password from logging in.
async function recordLogin(user, req) {
  try {
    const ip = cleanIp(req.ip); // the real client IP (server.js sets "trust proxy")
    const userAgent = (req.get("user-agent") || "").slice(0, 300);
    const device = parseDevice(userAgent);
    await Promise.all([
      User.updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: new Date(), lastLoginIp: ip, lastLoginDevice: device } },
      ),
      LoginActivity.create({ user: user._id, ip, device, userAgent }),
    ]);
  } catch (err) {
    console.error("Could not record login:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Brute-force protection (password guessing)
// ---------------------------------------------------------------------------
const FIFTEEN_MIN = 15 * 60 * 1000;

// "Too many failed attempts. Try again in 14 minutes." The minutes come from the moment the limiter
// window resets (req.rateLimit.resetTime), rounded up, so the message never says "0 minutes".
const tooManyFailed = (req, res, next, options) => {
  const msLeft = (req.rateLimit?.resetTime?.getTime?.() ?? Date.now() + options.windowMs) - Date.now();
  const minutes = Math.max(1, Math.ceil(msLeft / 60000));
  res.status(429).json({ message: `Too many failed attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` });
};

// skipSuccessfulRequests: a correct login is NOT counted, so only FAILED attempts use up the limit
// (the request is counted first and given back when the answer is a success, status < 400).
// Nothing is locked forever: the counter resets after 15 minutes.
//
// 1) Wide cap: 50 failed logins per 15 minutes per IP address, whatever the email.
//    Stops one computer from trying a password on MANY accounts.
const loginIpLimiter = rateLimit({
  windowMs: FIFTEEN_MIN, max: 50, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false, handler: tooManyFailed,
});
// 2) Narrow cap: 10 failed logins per 15 minutes per IP + email.
//    Stops guessing ONE account's password, without blocking classmates on the same school network
//    who log in to their own accounts (different emails = different counters).
const loginAccountLimiter = rateLimit({
  windowMs: FIFTEEN_MIN, max: 10, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false, handler: tooManyFailed,
  // Runs before validation, so the raw body value is cleaned here (lower-case, max length)
  keyGenerator: (req) => `${req.ip}|${String(req.body?.email ?? "").trim().toLowerCase().slice(0, 254)}`,
});
// Registration: 20 new accounts per hour per IP (stops mass sign-ups by a script)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many sign-ups from this network. Please try again later." },
});

const passwordRule = (field) => body(field)
  .isString().withMessage("Password is required")
  .isLength({ min: MEMBER.passwordMin, max: MEMBER.passwordMax })
  .withMessage(`Password must be ${MEMBER.passwordMin} to ${MEMBER.passwordMax} characters`);

// POST /api/auth/register  (role is NOT read from the body: everyone who registers is a member)
router.post(
  "/register",
  registerLimiter,
  [
    body("name").trim().notEmpty().withMessage("Name is required")
      .isLength({ max: MEMBER.name }).withMessage(`Name must be at most ${MEMBER.name} characters`),
    body("email").isLength({ max: MEMBER.email }).withMessage("Email is too long")
      .isEmail().withMessage("Enter a valid email").normalizeEmail(EMAIL_OPTS),
    // bcrypt only uses the first 72 bytes, so longer passwords are refused
    passwordRule("password"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      if (await User.findOne({ email }))
        return res.status(409).json({ message: "Email is already registered" });
      const user = await User.create({ name, email, password });
      await logActivity({ type: "member_registered", actor: user, member: user, meta: memberSnap(user) });
      res.status(201).json({ token: signToken(user), user: userPayload(user) });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/auth/login
router.post(
  "/login",
  loginIpLimiter,
  loginAccountLimiter,
  [
    body("email").isEmail().withMessage("Enter a valid email").normalizeEmail(EMAIL_OPTS),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  async (req, res, next) => {
    try {
      // +password: we need the hash here to compare, because the model hides it by default
      const user = await User.findOne({ email: req.body.email }).select("+password");
      if (!user || !(await user.matchPassword(req.body.password))) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Your account has been deactivated. Please contact the librarian." });
      }
      await recordLogin(user, req);
      res.json({ token: signToken(user), user: userPayload(user) });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/auth/me  (restores the session on page refresh; also brings the saved theme)
router.get("/me", protect, (req, res) => res.json({ user: userPayload(req.user) }));

// GET /api/auth/logins  — the current account's last login + its last 5 logins (Settings → Security)
router.get("/logins", protect, async (req, res, next) => {
  try {
    const logins = await LoginActivity.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(5).select("ip device createdAt").lean();
    res.json({
      lastLoginAt: req.user.lastLoginAt,
      lastLoginIp: req.user.lastLoginIp,
      lastLoginDevice: req.user.lastLoginDevice,
      logins,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile — the user edits their OWN profile.
// Only name, contact number and address (matchedData-style whitelist: email, role, memberId... are ignored).
router.put(
  "/profile",
  protect,
  [
    body("name").optional().isString().trim().notEmpty().withMessage("Name cannot be empty")
      .isLength({ max: MEMBER.name }).withMessage(`Name must be at most ${MEMBER.name} characters`),
    body("contactNumber").optional().isString().trim()
      .isLength({ max: MEMBER.contact }).withMessage(`Contact number must be at most ${MEMBER.contact} characters`)
      .custom((v) => v === "" || User.PH_MOBILE.test(v)).withMessage("Use a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX"),
    body("address").optional().isString().trim()
      .isLength({ max: MEMBER.address }).withMessage(`Address must be at most ${MEMBER.address} characters`),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id);
      for (const key of ["name", "contactNumber", "address"]) {
        if (req.body[key] !== undefined) user[key] = req.body[key];
      }
      const fields = user.modifiedPaths();
      await user.save();
      if (fields.length) await logActivity({ type: "member_updated", actor: user, member: user, meta: { ...memberSnap(user), fields, by: "self" } });
      res.json({ user: userPayload(user) });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/auth/preferences — save the chosen colour theme (one of the 8 keys)
router.put(
  "/preferences",
  protect,
  [body("theme").isIn(THEMES).withMessage("Unknown theme")],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(req.user._id, { $set: { "preferences.theme": req.body.theme } }, { new: true });
      res.json({ user: userPayload(user) });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
// Memory storage + 150 KB limit (the browser already shrinks photos to 256×256, usually 10–40 KB)
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, AVATAR_TYPES.includes(file.mimetype)),
}).single("avatar");

const receiveAvatar = (req, res, next) => uploadAvatar(req, res, (err) => {
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "The photo is larger than 150 KB" });
  if (err) return res.status(400).json({ message: 'Upload one image in the "avatar" field' });
  next();
});

// PUT /api/auth/avatar — upload or replace your own profile photo
router.put("/avatar", protect, receiveAvatar, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a JPG, PNG or WEBP image" });
    const info = imageInfo(req.file.buffer); // real type from the file's first bytes (magic bytes)
    if (!info || !AVATAR_TYPES.includes(info.type)) {
      return res.status(400).json({ message: "This file is not a real JPG, PNG or WEBP image" });
    }
    await UserAvatar.findOneAndUpdate(
      { user: req.user._id },
      { data: req.file.buffer, contentType: info.type, size: req.file.size, updatedAt: new Date() },
      { upsert: true, runValidators: true },
    );
    // A NEW random key on every upload: the photo URL changes, so browsers never show an old cached photo
    const avatarKey = crypto.randomBytes(16).toString("hex"); // 16 bytes = 32 hex characters
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { avatarKey } }, { new: true });
    res.json({ user: userPayload(user) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/auth/avatar — remove your profile photo (initials are shown again)
router.delete("/avatar", protect, async (req, res, next) => {
  try {
    await UserAvatar.deleteOne({ user: req.user._id });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { avatarKey: null } }, { new: true });
    res.json({ user: userPayload(user) });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Change your own password
// ---------------------------------------------------------------------------
// Extra limiter just for this route: 10 tries per 15 minutes, to slow down password guessing
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { message: "Too many attempts. Please wait 15 minutes and try again." },
});

// PUT /api/auth/password { currentPassword, newPassword }
router.put(
  "/password",
  passwordLimiter,
  protect,
  [
    body("currentPassword").isString().notEmpty().withMessage("Enter your current password")
      .isLength({ max: MEMBER.passwordMax }).withMessage("Current password is incorrect"),
    passwordRule("newPassword"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select("+password");
      if (!(await user.matchPassword(req.body.currentPassword))) {
        return res.status(400).json({ message: "Current password is incorrect", errors: [{ path: "currentPassword", msg: "Current password is incorrect" }] });
      }
      if (await user.matchPassword(req.body.newPassword)) {
        return res.status(400).json({ message: "The new password must be different from the current one", errors: [{ path: "newPassword", msg: "Must be different from the current password" }] });
      }
      user.password = req.body.newPassword; // hashed by the pre-save hook
      user.tokenVersion = (user.tokenVersion || 0) + 1; // every older token (other devices) stops working
      await user.save();
      await logActivity({ type: "password_changed", actor: user, member: user, meta: { ...memberSnap(user), by: "self" } });
      // A NEW token with the new version, so THIS device stays logged in
      res.json({ token: signToken(user), user: userPayload(user) });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
module.exports.userPayload = userPayload;
