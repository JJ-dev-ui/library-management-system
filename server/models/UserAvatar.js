const mongoose = require('mongoose');

// A profile photo, stored as binary data in its OWN collection (same idea as BookCover):
// user lists never load image bytes; only GET /api/avatars/:key does.
const userAvatarSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // one photo per user
  data: { type: Buffer, required: true },
  contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  size: { type: Number, required: true }, // bytes
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('UserAvatar', userAvatarSchema);
