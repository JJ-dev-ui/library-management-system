const express = require('express');
const helmet = require('helmet');
const { param } = require('express-validator');
const User = require('../models/User');
const UserAvatar = require('../models/UserAvatar');
const { validate } = require('../middleware/error');

const router = express.Router();

// GET /api/avatars/:key  (PUBLIC, read-only) — a profile photo for <img src="...">.
// Public because an <img> tag cannot send our JWT. Safe because the key is a random 32-hex value
// that changes on every upload: photos cannot be found by guessing user ids.
// crossOriginResourcePolicy "cross-origin" (THIS route only) lets the website load it from another domain.
router.get(
  '/:key',
  helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
  [param('key').matches(/^[a-f0-9]{32}$/).withMessage('Invalid photo key')],
  validate,
  async (req, res, next) => {
    try {
      const user = await User.findOne({ avatarKey: req.params.key }).select('_id').lean();
      const photo = user && (await UserAvatar.findOne({ user: user._id }));
      if (!photo) return res.status(404).json({ message: 'Photo not found' });

      const etag = `"${req.params.key}"`; // the key itself changes with every new photo
      res.set({
        'Content-Type': photo.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable', // the URL changes when the photo changes
        ETag: etag,
      });
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.send(photo.data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
