const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware: verifies the JWT and attaches the user to req.user
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Not authorized: no token' });

    const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id); // password is already hidden (select: false)

    if (!user) return res.status(401).json({ message: 'User no longer exists' });
    // If the admin deactivates someone, their existing token stops working immediately
    if (!user.isActive) return res.status(401).json({ message: 'Your account has been deactivated' });
    // Token from before the last password change (tv = token version; old tokens have none = 0)
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: 'Your session has ended. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Not authorized: invalid or expired token' });
  }
};

// Role-based access: members only (the member portal: requests, bookmarks, "my books", notifications).
// Librarians have their own admin pages; this keeps member-only actions (e.g. requesting a book)
// tied to a real member account.
exports.memberOnly = (req, res, next) => {
  if (req.user && req.user.role === 'member') return next();
  res.status(403).json({ message: 'Access denied: members only' });
};

// Role-based access: admin (librarian) only
exports.adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ message: 'Access denied: admin only' });
};