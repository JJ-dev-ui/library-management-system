import { MEMBER } from './limits';

// Options and validation shared by the Members page and its modals (values match the server whitelists)

export const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'member', label: 'Members' },
  { value: 'admin', label: 'Librarians' },
];

export const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
];

export const LAST_LOGIN_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'In the last 7 days' },
  { value: '30d', label: 'In the last 30 days' },
  { value: 'never', label: 'Never logged in' },
];

export const USER_SORTS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'newest', label: 'Newest first' },
  { value: 'last_login', label: 'Last login' },
  { value: 'most_loans', label: 'Most borrowed now' },
];

export const roleLabel = (role) => (role === 'admin' ? 'Librarian' : 'Member');

// Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX (same rule as the server)
export const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;

// Profile fields validation (the same limits as routes/users.js). withPassword: also check the password.
export function validateMember(f, { withPassword = false } = {}) {
  const e = {};
  if (!f.name.trim()) e.name = 'Name is required';
  else if (f.name.trim().length > MEMBER.name) e.name = `Name must be at most ${MEMBER.name} characters`;
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
  if (withPassword && (f.password.length < MEMBER.passwordMin || f.password.length > MEMBER.passwordMax)) {
    e.password = `Password must be ${MEMBER.passwordMin} to ${MEMBER.passwordMax} characters`;
  }
  if (f.contactNumber.trim() && !PH_MOBILE.test(f.contactNumber.trim())) e.contactNumber = 'Use 09XXXXXXXXX or +639XXXXXXXXX';
  if (f.address.trim().length > MEMBER.address) e.address = `Address must be at most ${MEMBER.address} characters`;
  if (f.notes.trim().length > MEMBER.notes) e.notes = `Notes must be at most ${MEMBER.notes} characters`;
  return e;
}

// express-validator error list -> { field: message } (first message per field)
export const fieldErrorsFrom = (err) => {
  const out = {};
  (err.response?.data?.errors || []).forEach((x) => { if (!out[x.path]) out[x.path] = x.msg; });
  return out;
};
