// ISBN helpers. An ISBN ends with a CHECK DIGIT calculated from the other digits, so a typo
// (one wrong or swapped digit) is detected without looking anything up.

// "978-0-13-235088-4" -> "9780132350884" (spaces and dashes removed, x -> X)
const cleanIsbn = (v) => String(v ?? '').replace(/[\s-]/g, '').toUpperCase();

// ISBN-13: digits are weighted 1,3,1,3,...; the total (with the check digit) must be divisible by 10
function validIsbn13(s) {
  if (!/^\d{13}$/.test(s)) return false;
  const sum = [...s].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return sum % 10 === 0;
}

// ISBN-10: digits are weighted 10,9,...,1 (the last may be X = 10); the total must be divisible by 11
function validIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  const sum = [...s].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0);
  return sum % 11 === 0;
}

const isValidIsbn = (s) => (s.length === 10 ? validIsbn10(s) : validIsbn13(s));

// The same book as an ISBN-13 ("978" + first 9 digits + a new check digit), so an ISBN-10 in a file
// is recognised as a book we already have under its ISBN-13 (and the other way around).
function toIsbn13(s) {
  if (s.length !== 10) return s;
  const body = `978${s.slice(0, 9)}`;
  const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}
function toIsbn10(s) {
  if (s.length !== 13 || !s.startsWith('978')) return null;
  const body = s.slice(3, 12);
  const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (10 - i), 0);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? 'X' : String(check));
}
// Every way this ISBN may already be stored
const isbnVariants = (s) => [...new Set([s, toIsbn13(s), toIsbn10(s)].filter(Boolean))];

module.exports = { cleanIsbn, isValidIsbn, toIsbn13, isbnVariants };
