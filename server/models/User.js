const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { nextMemberId } = require('../utils/counter');
const { THEMES, DEFAULT_THEME } = require('../utils/themes');

// Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX
const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false -> the hash is never included in query results unless we ask with .select('+password')
    password: { type: String, required: true, minlength: 6, select: false },
    // Two roles in ONE model: 'admin' = librarian, 'member' = regular user
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    // The admin can deactivate a member; deactivated users cannot log in
    isActive: { type: Boolean, default: true },

    // Library card number, e.g. LIB-2026-0001. Set automatically when the account is created.
    // sparse: accounts created before this field existed do not break the unique index.
    memberId: { type: String, unique: true, sparse: true, trim: true },
    contactNumber: {
      type: String, trim: true, default: '',
      validate: { validator: (v) => v === '' || PH_MOBILE.test(v), message: 'Use a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX' },
    },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    notes: { type: String, trim: true, maxlength: 500, default: '' }, // only librarians can see/edit this

    // Last successful login (details of every login are in the LoginActivity collection)
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },
    lastLoginDevice: { type: String, default: '' },

    // Profile photo: a random 32-hex key (new on every upload). The photo is served at
    // /api/avatars/<key>; a random key (not the user id) means nobody can guess other users' photo URLs.
    avatarKey: { type: String, default: null },

    // Personal settings
    preferences: {
      theme: { type: String, enum: THEMES, default: DEFAULT_THEME },
    },

    // "Log out other devices": this number is copied into every login token (JWT "tv").
    // Changing the password increases it, so tokens created before that stop working everywhere.
    tokenVersion: { type: Number, default: 0 },

    // When the member last OPENED the notification bell (Facebook-style "seen"). The bell badge counts
    // only notifications created after this moment; "read" is separate (per notification, on click).
    notificationsSeenAt: { type: Date, default: null },
  },
  { timestamps: true } // adds createdAt (= "joined") and updatedAt automatically
);

// Fast lookup of a photo by its key (sparse: users without a photo are not in the index)
userSchema.index({ avatarKey: 1 }, { sparse: true });

// New account -> give it the next member ID (atomic counter, so IDs are never duplicated)
userSchema.pre('save', async function () {
  if (this.isNew && !this.memberId) this.memberId = await nextMemberId();
});

// Password encryption: hash with bcrypt before saving, only when the password changed
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compares a typed password with the stored hash (returns true/false)
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.statics.PH_MOBILE = PH_MOBILE;

module.exports = mongoose.model('User', userSchema);
