// Options shared by the books filters, chips and forms. The `value`s must match the server whitelists.

export const SEARCH_IN = [
  { value: 'all', label: 'All fields' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'isbn', label: 'ISBN' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'subject', label: 'Subject' },
];

export const AVAILABILITY = [
  { value: '', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'All borrowed' },
];

export const BOOK_SORTS = [
  { value: 'title', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
  { value: 'author', label: 'Author A–Z' },
  { value: 'newest', label: 'Recently added' },
  { value: 'year_desc', label: 'Year (newest)' },
  { value: 'year_asc', label: 'Year (oldest)' },
  { value: 'available', label: 'Most available' },
  { value: 'popular', label: 'Most borrowed' },
];

export const LENGTHS = [
  { value: 'short', label: 'Short (< 200 pages)' },
  { value: 'medium', label: 'Medium (200–400 pages)' },
  { value: 'long', label: 'Long (400+ pages)' },
];

export const COPIES = [
  { value: 'single', label: '1 copy' },
  { value: 'few', label: '2–5 copies' },
  { value: 'many', label: '6+ copies' },
];

export const ADDED_WITHIN = [
  { value: 'today', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

// Shelf code prefixes used by the seed (PRG-B4 = Programming, shelf B, row 4)
export const SHELF_NAMES = {
  PRG: 'Programming', CSC: 'Computer Science', FIC: 'Fiction', FIL: 'Filipino Literature',
  CLS: 'Classic Literature', HIS: 'History', SCI: 'Science', MTH: 'Mathematics',
  BUS: 'Business', SLF: 'Self-Help', PHI: 'Philosophy', YAD: 'Young Adult', GEN: 'General',
};

// The imported catalog stores some languages as 3-letter MARC codes ("CHI"); show a readable name
const LANGUAGE_NAMES = {
  AFR: 'Afrikaans', ANG: 'Old English', ARM: 'Armenian', BEL: 'Belarusian', BUL: 'Bulgarian', CAT: 'Catalan',
  CHI: 'Chinese', DAN: 'Danish', DUT: 'Dutch', FIN: 'Finnish', GEM: 'Germanic', GLE: 'Irish', GRE: 'Greek',
  HEB: 'Hebrew', HIN: 'Hindi', HRV: 'Croatian', HUN: 'Hungarian', IND: 'Indonesian', ITA: 'Italian',
  JPN: 'Japanese', LAT: 'Latin', LIT: 'Lithuanian', NOR: 'Norwegian', PER: 'Persian', POL: 'Polish',
  POR: 'Portuguese', RUM: 'Romanian', RUS: 'Russian', SND: 'Sindhi', SRP: 'Serbian', SWE: 'Swedish',
  TAM: 'Tamil', TIB: 'Tibetan', TUR: 'Turkish', UKR: 'Ukrainian', UND: 'Undetermined', URD: 'Urdu',
  VIE: 'Vietnamese', WEL: 'Welsh', YID: 'Yiddish',
};
export const languageLabel = (code) => LANGUAGE_NAMES[code] || code || '—';

export const labelOf = (list, value) => list.find((o) => o.value === value)?.label || value;

// Copies currently borrowed (not on the shelf)
export const onLoanOf = (book) => Math.max(0, (book.totalCopies || 0) - (book.availableCopies || 0));

// Was this book ever lent? (timesBorrowed goes +1 on every transaction.) Such a book is ARCHIVED
// instead of deleted. The server checks the real transactions too, so this only picks the button.
export const bookHasHistory = (book) => (book?.timesBorrowed || 0) > 0;
