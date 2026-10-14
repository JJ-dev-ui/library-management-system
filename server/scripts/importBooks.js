// ONE-TIME IMPORT: downloads ~1,000 books from Open Library into our own files.
// Run from the server folder:  npm run import-books
//
// Output:
//   server/data/books.json          -> book details (seed.js reads this, no internet needed)
//   client/public/covers/{isbn}.jpg -> cover images (served by our own frontend)
//
// After this runs once, our system never calls Open Library again.
// It follows Open Library's API rules: identified User-Agent, max ~2-3 requests per second,
// batch search (100 books per request) instead of one request per book.
// If it stops halfway (internet drop), just run it again: finished work is cached and skipped.
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const TARGET_TOTAL = 1000;
const PER_CATEGORY = Math.ceil(TARGET_TOTAL / 12);
const DELAY_MS = Number(process.env.IMPORT_DELAY_MS) || 400; // ~2.5 requests per second
const CONTACT = process.env.OPENLIBRARY_CONTACT || 'student-project@example.com';
const HEADERS = { 'User-Agent': `StacksLibrarySchoolProject/1.0 (${CONTACT})` };

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_FILE = path.join(DATA_DIR, 'books.json');
const CACHE_FILE = path.join(DATA_DIR, '.import-cache.json');
const COVERS_DIR = path.join(__dirname, '..', '..', 'client', 'public', 'covers');

// Our 12 clean categories -> the Open Library subjects we search for each one
const CATEGORIES = [
  { name: 'Programming', subjects: ['Computer programming', 'Programming languages (Electronic computers)', 'JavaScript (Computer program language)', 'Python (Computer program language)'] },
  { name: 'Computer Science', subjects: ['Computer science', 'Algorithms', 'Artificial intelligence', 'Database management'] },
  { name: 'Fiction', subjects: ['Fantasy fiction', 'Mystery fiction', 'Science fiction', 'Thrillers (Fiction)'] },
  { name: 'Filipino Literature', subjects: ['Philippine literature', 'Philippines, fiction', 'Filipino fiction', 'Philippines, history'], english: false },
  { name: 'Classic Literature', subjects: ['Classic literature', 'Classics', 'English fiction'] },
  { name: 'History', subjects: ['World history', 'World War, 1939-1945', 'Ancient history', 'Civilization'] },
  { name: 'Science', subjects: ['Physics', 'Biology', 'Astronomy', 'Chemistry'] },
  { name: 'Mathematics', subjects: ['Mathematics', 'Calculus', 'Statistics', 'Algebra'] },
  { name: 'Business', subjects: ['Business', 'Management', 'Economics', 'Entrepreneurship'] },
  { name: 'Self-Help', subjects: ['Self-help techniques', 'Self-actualization (Psychology)', 'Success', 'Habits'] },
  { name: 'Philosophy', subjects: ['Philosophy', 'Ethics', 'Stoics', 'Existentialism'] },
  { name: 'Young Adult', subjects: ['Young adult fiction', 'Coming of age, fiction', 'Dystopias'] },
];

const LANGUAGES = { eng: 'English', fil: 'Filipino', tgl: 'Tagalog', spa: 'Spanish', fre: 'French', ger: 'German' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET with polite delay + simple retry (handles timeouts / 429 Too Many Requests)
async function get(url, as = 'json') {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await sleep(DELAY_MS);
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null;
      return as === 'json' ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch (err) {
      const wait = attempt * 3000;
      console.warn(`   retry ${attempt}/4 in ${wait / 1000}s (${err.message})`);
      await sleep(wait);
    }
  }
  return null;
}

// Prefer a 13-digit ISBN (978/979...), otherwise a 10-digit one
function pickIsbn(list = []) {
  const clean = list.map((i) => String(i).replace(/[^0-9X]/gi, ''));
  return clean.find((i) => i.length === 13 && /^97[89]/.test(i)) || clean.find((i) => i.length === 10) || null;
}

// Open Library descriptions are either a string or { value: string }; strip their "See also" footers
function cleanDescription(desc) {
  let text = typeof desc === 'string' ? desc : desc?.value || '';
  text = text.split(/\n-{3,}/)[0]; // cut "----------" sections
  text = text.replace(/\[([^\]]+)\]\[\d+\]/g, '$1').replace(/\[\d+\]:\s*\S+/g, ''); // markdown links
  text = text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > 2000 ? `${text.slice(0, 1997).trim()}...` : text;
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function searchCategory(cat, page) {
  const subjects = cat.subjects.map((s) => `subject:"${s}"`).join(' OR ');
  const q = cat.english === false ? `(${subjects})` : `(${subjects}) AND language:eng`;
  const fields = 'key,title,subtitle,author_name,isbn,cover_i,first_publish_year,publisher,number_of_pages_median,language,subject,first_sentence';
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=${fields}&limit=100&page=${page}`;
  const data = await get(url);
  return data?.docs || [];
}

// Turn one search result into our book shape (or null if it is missing required data)
function toBook(doc, category) {
  const isbn = pickIsbn(doc.isbn);
  const authors = [...new Set(doc.author_name || [])].slice(0, 3);
  if (!doc.title || !isbn || !doc.cover_i || authors.length === 0) return null;
  const langCode = (doc.language || [])[0];
  return {
    title: doc.title.trim().slice(0, 200),
    subtitle: (doc.subtitle || '').trim().slice(0, 200),
    authors,
    isbn,
    description: '', // filled in step 2
    coverId: doc.cover_i, // used in step 3, removed before saving
    category,
    subjects: (doc.subject || []).slice(0, 8),
    publisher: (doc.publisher || [])[0] || '',
    publishedYear: doc.first_publish_year || null,
    pages: doc.number_of_pages_median || null,
    language: LANGUAGES[langCode] || (langCode ? langCode.toUpperCase() : 'English'),
    openLibraryKey: doc.key,
    firstSentence: Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : '',
  };
}

(async () => {
  if (typeof fetch !== 'function') {
    console.error('This script needs Node.js 18 or newer (run "node -v" to check).');
    process.exit(1);
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(COVERS_DIR, { recursive: true });
  const cache = loadJson(CACHE_FILE, { descriptions: {} });
  const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));

  // ---------- Step 1: search Open Library, 100 results per request ----------
  console.log(`Step 1/3: searching Open Library (${CATEGORIES.length} categories, ~${PER_CATEGORY} books each)`);
  const books = [];
  const seenIsbn = new Set();
  const seenWork = new Set();
  const nextPage = {};

  const collect = async (cat, want) => {
    let added = 0;
    while (added < want && (nextPage[cat.name] || 1) <= 6) {
      const page = nextPage[cat.name] || 1;
      nextPage[cat.name] = page + 1;
      const docs = await searchCategory(cat, page);
      if (docs.length === 0) { nextPage[cat.name] = 99; break; } // no more results
      for (const doc of docs) {
        if (added >= want || books.length >= TARGET_TOTAL) break;
        const book = toBook(doc, cat.name);
        if (!book || seenIsbn.has(book.isbn) || seenWork.has(book.openLibraryKey)) continue;
        seenIsbn.add(book.isbn);
        seenWork.add(book.openLibraryKey);
        books.push(book);
        added++;
      }
    }
    return added;
  };

  for (const cat of CATEGORIES) {
    const added = await collect(cat, PER_CATEGORY);
    console.log(`   ${cat.name.padEnd(20)} ${added} books`);
  }
  // Some subjects (e.g. Filipino Literature) have fewer results: top up from the bigger categories
  for (const cat of CATEGORIES) {
    if (books.length >= TARGET_TOTAL) break;
    const added = await collect(cat, TARGET_TOTAL - books.length);
    if (added) console.log(`   + ${added} more ${cat.name}`);
  }
  console.log(`   Total: ${books.length} books\n`);

  // ---------- Step 2: descriptions (one request per book, cached) ----------
  console.log('Step 2/3: fetching descriptions');
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    if (!(b.openLibraryKey in cache.descriptions)) {
      const work = await get(`https://openlibrary.org${b.openLibraryKey}.json`);
      cache.descriptions[b.openLibraryKey] = work ? cleanDescription(work.description) : '';
      if (i % 25 === 0) saveCache();
    }
    b.description = cache.descriptions[b.openLibraryKey] || b.firstSentence || `${b.title} by ${b.authors.join(', ')}.`;
    if ((i + 1) % 50 === 0 || i === books.length - 1) console.log(`   ${i + 1}/${books.length}`);
  }
  saveCache();

  // ---------- Step 3: download covers into client/public/covers ----------
  console.log('\nStep 3/3: downloading covers');
  let failed = 0;
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    const file = path.join(COVERS_DIR, `${b.isbn}.jpg`);
    if (!fs.existsSync(file)) {
      // By cover ID (not by ISBN): Open Library rate-limits ISBN cover lookups much more strictly
      const img = await get(`https://covers.openlibrary.org/b/id/${b.coverId}-M.jpg`, 'buffer');
      if (img && img.length > 1000) fs.writeFileSync(file, img);
      else failed++;
    }
    b.coverUrl = fs.existsSync(file) ? `/covers/${b.isbn}.jpg` : '';
    if ((i + 1) % 50 === 0 || i === books.length - 1) console.log(`   ${i + 1}/${books.length}`);
  }

  // ---------- Save ----------
  const output = books.map(({ coverId, firstSentence, ...book }) => book);
  fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nDone. Saved ${output.length} books to server/data/books.json`);
  console.log(`Covers saved in client/public/covers (${failed} could not be downloaded; those show a fallback).`);
  console.log('Next: npm run seed');
})().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});