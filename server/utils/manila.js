// Date helpers for the library's time zone (Asia/Manila = UTC+8 all year, no daylight saving time).
// Used for day grouping, "today" filters, export dates and file names, whatever time zone the server is in.
const TZ = 'Asia/Manila';
const OFFSET_MS = 8 * 60 * 60 * 1000;

// Midnight (Manila) of the day `daysAgo` days before `now`, as a real Date
function manilaMidnight(now = new Date(), daysAgo = 0) {
  const m = new Date(now.getTime() + OFFSET_MS); // its UTC fields = Manila's clock
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() - daysAgo) - OFFSET_MS);
}

// "2026-10-13" for a Date, in Manila
const manilaDay = (d) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);

// "2026-10-13 09:42" (withTime) or "2026-10-13", in Manila. '' for no date.
function formatManila(d, withTime = true) {
  if (!d) return '';
  const iso = new Date(new Date(d).getTime() + OFFSET_MS).toISOString(); // shifted to Manila
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : iso.slice(0, 10);
}

// A Date whose UTC fields show Manila's wall clock. Excel stores dates without a time zone, so a
// cell made from this Date displays the Manila time (not UTC) when the file is opened.
const manilaWallClock = (d) => (d ? new Date(new Date(d).getTime() + OFFSET_MS) : null);

// "2026-10-14-0912" for file names
const fileStamp = (now = new Date()) => formatManila(now).replace(' ', '-').replace(':', '');

module.exports = { TZ, manilaMidnight, manilaDay, formatManila, manilaWallClock, fileStamp };
