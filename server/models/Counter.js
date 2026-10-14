const mongoose = require('mongoose');

// One document per running number, e.g. { _id: 'transaction-2026', seq: 123 }.
// Used to create readable IDs like TX-2026-000123 and LIB-2026-0001 (see utils/counter.js).
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
