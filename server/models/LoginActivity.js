const mongoose = require('mongoose');

// One document per successful login: when, from which IP address and which device/browser.
// Shown to librarians in the member's "Login activity" tab. (No location lookups are done.)
const loginActivitySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ip: { type: String, default: '' },
    device: { type: String, default: '' },     // e.g. "Chrome on Windows"
    userAgent: { type: String, maxlength: 300, default: '' }, // raw browser header, shortened
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loginActivitySchema.index({ user: 1, createdAt: -1 }); // "last 10 logins of this user"

// PRIVACY (RA 10173, Data Privacy Act): personal data like IP addresses may only be kept as long as it
// is needed. A TTL ("time to live") index makes MongoDB itself delete each login record 90 days after
// createdAt (a background job checks about once a minute). The audit trail (ActivityLog) has NO TTL:
// it records what librarians did and stores no IP addresses.
const NINETY_DAYS = 90 * 24 * 60 * 60;
loginActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: NINETY_DAYS });

module.exports = mongoose.model('LoginActivity', loginActivitySchema);
