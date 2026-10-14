// Escape regex special characters so user text is matched LITERALLY.
// Without this, a search like ".*" or "(a+)+" could match everything or freeze the database (ReDoS).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case-insensitive "contains" regex built from user text (always escaped)
const containsRx = (s) => new RegExp(escapeRegex(String(s).trim()), 'i');

module.exports = { escapeRegex, containsRx };
