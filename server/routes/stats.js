const express = require('express');
const { protect, adminOnly } = require('../middleware/auth');
const { libraryStats } = require('../utils/libraryStats');

const router = express.Router();

// GET /api/stats  (admin only): the shared library numbers (Books page stat cards).
// Replaces the old /api/stats/admin. The Dashboard and Transactions stats use the same helper.
router.get('/', protect, adminOnly, async (req, res, next) => {
  try {
    res.json(await libraryStats());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
