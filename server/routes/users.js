const express = require('express');
const { body, matchedData, param, query } = require('express-validator');
const User = require('../models/User');
const Borrow = require('../models/Borrow');
const LoginActivity = require('../models/LoginActivity');
const UserAvatar = require('../models/UserAvatar');
const BorrowRequest = require('../models/BorrowRequest');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { userFilterRules, userPipeline, userSort } = require('../queries/users');
const { deriveStatus, statusFilter } = require('../utils/transactionStatus');
const { MEMBER } = require('../utils/limits');
const { logActivity, memberSnap } = require('../utils/activity');
const { MESSAGES } = require('../utils/labels');

// "Members" page in the UI. Manages ALL accounts (members and librarians). Admin only.
const router = express.Router();

// Email clean-up: lower-case, but KEEP the dots in Gmail addresses (the default would turn
// "andrea.reyes@gmail.com" into "andreareyes@gmail.com", so the address you typed would not match)
const EMAIL_OPTS = { gmail_remove_dots: false };
router.use(protect, adminOnly);

const DAY_MS = 24 * 60 * 60 * 1000;
const PH_MOBILE = User.PH_MOBILE;

// Filters, sorts and their validation live in queries/users.js, shared with the export
const listRules = [
  ...userFilterRules(query),
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('Invalid page').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit').toInt(),
];

// Never send the password hash, even by accident
const safeUser = (u) => {
  const obj = typeof u.toObject === 'function' ? u.toObject() : { ...u };
  delete obj.password;
  delete obj.tokenVersion;
  return obj;
};

// GET /api/users — search, filters, sorting, pagination; every row has activeLoans + overdueLoans
router.get('/', listRules, validate, async (req, res, next) => {
  try {
    const q = req.query;
    const now = new Date();
    const page = q.page || 1;
    const limit = q.limit || 10;

    const [result] = await User.aggregate([
      ...userPipeline(q, now),
      // One query returns both the page of rows and the total count
      {
        $facet: {
          rows: [{ $sort: userSort(q.sort) }, { $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]);

    const total = result.total[0]?.n || 0;
    res.json({ users: result.rows, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/stats — numbers for the stat cards
router.get('/stats', async (req, res, next) => {
  try {
    const [total, active, overdueUserIds] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Borrow.distinct('user', statusFilter('overdue')), // distinct = each user counted once
    ]);
    res.json({ total, active, deactivated: total - active, withOverdue: overdueUserIds.length });
  } catch (err) {
    next(err);
  }
});

const idRule = [param('id').isMongoId().withMessage('Invalid user ID')];

// GET /api/users/:id — profile + borrowing stats + transaction history + last 10 logins
router.get('/:id', idRule, validate, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).lean(); // password hidden by select: false
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [loans, logins, hasRequests] = await Promise.all([
      Borrow.find({ user: user._id }).populate('book', 'title coverUrl isbn').sort({ borrowedAt: -1 }).limit(200).lean(),
      LoginActivity.find({ user: user._id }).sort({ createdAt: -1 }).limit(10).lean(),
      BorrowRequest.exists({ user: user._id }),
    ]);

    const now = new Date();
    const history = loans.map((l) => ({ ...l, derivedStatus: deriveStatus(l, now) }));
    const count = (s) => history.filter((l) => l.derivedStatus === s).length;
    const returnedOnTime = count('returned_on_time');
    const returnedLate = count('returned_late');
    const returned = returnedOnTime + returnedLate;

    res.json({
      user: safeUser(user),
      stats: {
        // Any transaction at all -> the account can only be deactivated, never deleted
        hasHistory: history.length > 0 || !!hasRequests,
        totalBorrowed: history.length,
        activeLoans: history.filter((l) => l.status === 'borrowed').length,
        overdueLoans: count('overdue'),
        returnedOnTime,
        returnedLate,
        onTimeRate: returned ? Math.round((returnedOnTime / returned) * 100) : null,
      },
      history,
      logins,
    });
  } catch (err) {
    next(err);
  }
});

// Validation for create (POST) and update (PUT).
// These are FUNCTIONS that build a new chain each time: express-validator chains are mutable,
// so calling .optional() on a shared chain would also make the field optional for POST.
const nameRule = () => body('name').isString().trim().notEmpty().withMessage('Name is required')
  .isLength({ max: MEMBER.name }).withMessage(`Name must be at most ${MEMBER.name} characters`);
const emailRule = () => body('email').isString().isLength({ max: MEMBER.email }).withMessage(`Email must be at most ${MEMBER.email} characters`)
  .isEmail().withMessage('Enter a valid email').normalizeEmail(EMAIL_OPTS);
const roleRule = () => body('role').isIn(['member', 'admin']).withMessage('Role must be member or librarian');
const contactRule = () => body('contactNumber').optional().isString().trim()
  .isLength({ max: MEMBER.contact }).withMessage(`Contact number must be at most ${MEMBER.contact} characters`)
  .custom((v) => v === '' || PH_MOBILE.test(v)).withMessage('Use a PH mobile number: 09XXXXXXXXX or +639XXXXXXXXX');
const addressRule = () => body('address').optional().isString().trim().isLength({ max: MEMBER.address }).withMessage(`Address must be at most ${MEMBER.address} characters`);
const notesRule = () => body('notes').optional().isString().trim().isLength({ max: MEMBER.notes }).withMessage(`Notes must be at most ${MEMBER.notes} characters`);
// Max 72: bcrypt ignores everything after the 72nd byte, so a longer password would give a false sense of security
const passwordRule = () => body('password').isString().isLength({ min: MEMBER.passwordMin, max: MEMBER.passwordMax })
  .withMessage(`Password must be ${MEMBER.passwordMin} to ${MEMBER.passwordMax} characters`);

// Would this change leave the library with NO active librarian? (target is losing admin rights)
async function isLastActiveAdmin(target) {
  if (target.role !== 'admin' || !target.isActive) return false;
  const others = await User.countDocuments({ _id: { $ne: target._id }, role: 'admin', isActive: true });
  return others === 0;
}

// POST /api/users — create an account (member or librarian)
router.post(
  '/',
  [nameRule(), emailRule(), passwordRule(), roleRule(), contactRule(), addressRule(), notesRule()],
  validate,
  async (req, res, next) => {
    try {
      const data = matchedData(req, { locations: ['body'] }); // whitelist: only the fields above
      if (await User.exists({ email: data.email })) return res.status(409).json({ message: 'Email is already registered' });
      const user = await User.create(data); // pre-save hooks: hash the password + give a member ID
      await logActivity({ type: 'member_added', actor: req.user, member: user, meta: { ...memberSnap(user), role: user.role } });
      res.status(201).json({ user: safeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/users/:id — edit profile, role or active status
router.put(
  '/:id',
  [
    ...idRule,
    nameRule().optional(), emailRule().optional(), roleRule().optional(), contactRule(), addressRule(), notesRule(),
    body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false').toBoolean(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const data = matchedData(req, { locations: ['body'] });
      const isSelf = user._id.equals(req.user._id);

      // Guard rails
      const roleChanges = data.role !== undefined && data.role !== user.role;
      if (isSelf && data.isActive === false) return res.status(400).json({ message: 'You cannot deactivate your own account' });
      if (isSelf && roleChanges) return res.status(400).json({ message: 'You cannot change your own role' });
      const losesAdmin = (roleChanges && data.role !== 'admin') || data.isActive === false;
      if (losesAdmin && (await isLastActiveAdmin(user))) {
        return res.status(400).json({ message: 'There must always be at least one active librarian account' });
      }
      if (data.email && data.email !== user.email && (await User.exists({ email: data.email }))) {
        return res.status(409).json({ message: 'Email is already registered' });
      }

      Object.assign(user, data);
      // modifiedPaths() = the fields whose value really changed (same value again does not count)
      const changed = user.modifiedPaths();
      await user.save();
      // Activation is its own event; any other change is "member updated"
      if (changed.includes('isActive')) {
        await logActivity({ type: user.isActive ? 'member_activated' : 'member_deactivated', actor: req.user, member: user, meta: memberSnap(user) });
      }
      const fields = changed.filter((f) => f !== 'isActive');
      if (fields.length) await logActivity({ type: 'member_updated', actor: req.user, member: user, meta: { ...memberSnap(user), fields } });
      res.json({ user: safeUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/users/:id/password — librarian sets a new password (hashed by the pre-save hook)
router.put('/:id/password', [...idRule, passwordRule()], validate, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = req.body.password;
    // Also signs the member out on every device: their old tokens no longer match tokenVersion
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await logActivity({ type: 'password_changed', actor: req.user, member: user, meta: { ...memberSnap(user), by: 'librarian' } });
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — only for accounts that never borrowed anything.
// An account WITH borrowing history is kept (deactivate it instead), so past transactions always
// show who borrowed the book.
router.delete('/:id', idRule, validate, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user._id.equals(req.user._id)) return res.status(400).json({ message: 'You cannot delete your own account' });

    // ANY transaction (borrowed now or returned long ago) or borrow request blocks the delete
    if ((await Borrow.exists({ user: user._id })) || (await BorrowRequest.exists({ user: user._id }))) {
      return res.status(400).json({ message: MESSAGES.memberHasHistory });
    }
    if (await isLastActiveAdmin(user)) {
      return res.status(400).json({ message: 'There must always be at least one active librarian account' });
    }

    // The member's own personal data goes too (login records, photo, bookmarks, notifications)
    await Promise.all([
      user.deleteOne(), LoginActivity.deleteMany({ user: user._id }), UserAvatar.deleteOne({ user: user._id }),
      Bookmark.deleteMany({ user: user._id }), Notification.deleteMany({ user: user._id }),
    ]);
    // The account is gone, so the snapshot (name, member ID) is what the activity row will show
    await logActivity({ type: 'member_deleted', actor: req.user, member: user._id, meta: { ...memberSnap(user), memberId: user.memberId } });
    res.json({ message: 'Account deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
