const ActivityLog = require('../models/ActivityLog');

// Writes one row to the activity log (audit trail).
// IMPORTANT: logging must NEVER break the real action. If saving the log fails (database hiccup,
// bad value...), the error is only printed; the lend/return/edit that called this still succeeds.
// The function always resolves, so callers can simply `await logActivity({...})`.
async function logActivity({ type, actor, member, book, transaction, meta = {}, createdAt }) {
  try {
    await ActivityLog.create({
      type,
      actor: actor?._id || actor,
      member: member?._id || member,
      book: book?._id || book,
      transaction: transaction?._id || transaction,
      meta,
      ...(createdAt ? { createdAt } : {}),
    });
  } catch (err) {
    console.error(`Could not log activity "${type}":`, err.message);
  }
}

// Readable snapshots stored in meta, so a row still shows a name after the record is deleted
const bookSnap = (b) => (b ? { bookTitle: b.title } : {});
const memberSnap = (u) => (u ? { memberName: u.name } : {});

module.exports = { logActivity, bookSnap, memberSnap };
