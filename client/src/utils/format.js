// Small display helpers shared by many pages
import { LATE } from './labels';

const DAY_MS = 24 * 60 * 60 * 1000;

// "Juan Dela Cruz" -> "JD"
export const initials = (name = '') =>
  name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// EVENTS (borrowed, returned, logins) show date + time: "Oct 13, 2026 · 9:42 PM".
// RETURN DATES show the date only (formatDate), because a book may be returned any time that day.
export const formatDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${formatDate(date)} · ${time}`;
};

// Calendar-day difference (ignores the time of day), e.g. due tomorrow = 1
const dayDiff = (date) => {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / DAY_MS);
};

// Return date as words: "In 2 days", "Return today", "3 days late"
// (the UI avoids the words "due", "overdue" and "loan" so new librarians are not confused)
export const dueText = (dueDate) => {
  const n = dayDiff(dueDate);
  if (n === 0) return 'Return today';
  if (n === 1) return 'Return tomorrow';
  if (n > 1) return `In ${n} days`;
  return LATE.days(-n);
};

// "Oct 27" (short dates inside badges)
export const shortDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

// "Added today", "Added yesterday", "Added 3 days ago", then "Added Oct 3, 2026" (member feed posts)
export const addedAgo = (d) => {
  const n = -dayDiff(d);
  if (n <= 0) return 'Added today';
  if (n === 1) return 'Added yesterday';
  if (n < 30) return `Added ${n} days ago`;
  return `Added ${formatDate(d)}`;
};

// "Expires today", "Expires tomorrow", "Expires in 2 days" (pending requests)
export const expiresText = (d) => {
  const n = dayDiff(d);
  if (n <= 0) return 'Expires today';
  if (n === 1) return 'Expires tomorrow';
  return `Expires in ${n} days`;
};

// "Return in 3 days", "Return today", "4 days late" (member's borrowed books)
export const returnText = (dueDate) => {
  const n = dayDiff(dueDate);
  if (n > 1) return `Return in ${n} days`;
  if (n === 1) return 'Return tomorrow';
  if (n === 0) return 'Return today';
  return LATE.days(-n);
};

// "just now", "5 min ago", "3 hours ago", "2 days ago", then a normal date
export const timeAgo = (d) => {
  if (!d) return 'Never';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${s < 7200 ? '' : 's'} ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} day${s < 172800 ? '' : 's'} ago`;
  return formatDate(d);
};

// <input type="date"> gives "2026-10-13". Turn it into the start / end of that day in the
// user's LOCAL time zone, as an ISO string the API understands.
export const dayStartISO = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toISOString() : undefined);
export const dayEndISO = (ymd) => (ymd ? new Date(`${ymd}T23:59:59.999`).toISOString() : undefined);
