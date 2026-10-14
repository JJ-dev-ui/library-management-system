# Round 3 report: search speed, tables, details modals, covers

Branch `rebuild`, **not committed**. No `.env` file was touched, and `npm run seed` / `npm run reset` / `npm run backfill` were **not** run against the real database.

## What you need to do manually
1. `cd server && npm install` installs **multer** (the new package for cover uploads).
2. `npm run backfill` in `server/` fills in missing transaction codes and member IDs on your existing data. It is safe to run more than once.
3. Optional: `npm run seed` gives fresh demo data. Its return dates are now the end of the day, and its member IDs and codes are filled in.

---

## Phase A: Search speed

### Changes
- **Dev-only request timer:** `server/middleware/timing.js` logs `GET /api/books?search=x 200 9.4 ms`. It is switched on only when `NODE_ENV !== 'production'`.
- **Books list:**
  - Now an aggregation that returns only the fields the table needs.
  - Sends `descriptionPreview` (160 characters, via `$substrCP`) plus `descriptionLength` instead of the full description. The details endpoint still sends the full text.
  - `find` and `countDocuments` run in parallel.
- **`GET /books/facets`:** cached in memory for 5 minutes and cleared on every book create, update, delete or cover change.
- **Client:**
  - `utils/facetsCache.js`: the filter options are fetched once and shared by the Dashboard, the Books page and the book form.
  - Search debounce is now 250 ms (`useUrlSearchText`).
  - `hooks/useListQuery.js`, used by Books, Members and Transactions:
    - Every request has an AbortController, so an older response can never overwrite a newer one.
    - Skeletons appear only on the first load and when the page or page size changes.
    - When the search, a filter or the sort changes, the old rows stay visible at 50% opacity under a thin animated progress bar (`components/table/ListArea.jsx`).
    - The next page is prefetched into a 30-second cache. In the browser, clicking "next" shows page 2 in about 60 ms, with no skeleton and no new request.

### Search timing
Measured on an in-memory copy of the seeded database (1,000 books), median of 25 requests after 3 warm-up requests:

| Query | Before (server ms) | After (server ms) | Response size before → after |
|---|---|---|---|
| `search=the` | 8.6 | 9.5 | 5.9 → 6.4 KB |
| `search=history` | 9.5 | 10.2 | 5.9 → 6.3 KB |
| `search=rizal&searchIn=author` | 14.0 | 15.5 | 1.2 → 1.3 KB |
| `search=978&searchIn=isbn` | 9.3 | 8.7 | 6.0 → 6.3 KB |
| `search=love&category=Fiction&availability=available` | 5.8 | 4.6 | 5.8 → 6.3 KB |
| no search | 6.3 | 6.0 | 6.0 → 6.3 KB |

**What the numbers mean:** the server was already fast (5–15 ms), and it is unchanged within measurement noise. The old list already left out the description, so the new 160-character preview adds about 0.4 KB per page.

The slowness you see in real use comes from the network round trip to Atlas and from the screen flashing skeletons on every keystroke. The client changes target exactly that: fewer requests (250 ms debounce, cached filter options), no skeleton flash, and the next page already loaded. These numbers are local, so the real Atlas latency is not included.

---

## Phase B: Global table improvements
- **Books page:** the four stat cards are back, via the shared `components/admin/LibraryStats.jsx` that the Dashboard also uses. They update after a delete or a lend.
- **Full-screen tables (`.page-fill`):**
  - Applies to the Dashboard, Books, Members and Transactions pages.
  - From 768 px wide and 640 px tall, the page fits the window. The header, stat cards, toolbar and pager stay in place, and only the table or card area scrolls, with a sticky column header.
  - On phones, or windows shorter than 640 px, the page scrolls normally.
  - Tested with no page scroll at 768×1024, 1366×768 and 1920×1080. At 1366×768 the table area is 312–347 px tall.
- **Text hierarchy:**
  - `DataTable` has a `primary` column flag. Primary columns use the normal text colour: Books → book (cover, title, authors), Members → name and email, Transactions → code and book.
  - Every other cell uses `--color-muted` (4.9:1 contrast).
  - Availability text is muted, and only its dot is coloured.
  - The Librarian badge is now a soft gold tint instead of solid gold.
- **Books columns:**
  - "Year" is renamed "Published".
  - New columns: Shelf (monospace), Language, Description (2 lines, ~90 characters + "…", with the longer text in a tooltip).
  - Publisher stays on one line, is cut at ~24 characters, and shows the full name in a tooltip.
  - A **Columns** dropdown (`components/books/ColumnsMenu.jsx`, table view only) remembers your choice in localStorage `stacks.bookColumns`.
  - Defaults: Publisher, Category, Published, Shelf, Availability. Optional: ISBN, Language, Description. Book is always shown.
- **Pager text:** "Showing 991–1,000 of 1,000 books", with "members" and "transactions" on the other pages.

## Phase C: Book details modal and dates
- **Current borrowers:** a compact list (`components/books/BorrowerList.jsx`).
  - Each row shows the avatar, name, muted member ID, "Borrowed <date · time>" and "Return by <date>".
  - A soft "Late" or "Due soon" badge appears only when relevant.
  - 5 per page, with "1–5 of 12" and previous/next buttons.
  - Empty state: "No one is borrowing this book right now."
- **Dates and times** (`utils/format.js`):
  - Events use `formatDateTime`: "Oct 13, 2026 · 9:42 PM" (borrowed, returned, login activity, lend toast).
  - Return dates use `formatDate`: date only.
- **Server:**
  - A new loan's return date is the **end of the 14th day** (23:59:59.999, server time), via `addDaysEndOfDay` in `utils/transactionStatus.js`.
  - Extending adds 7 days and keeps the end of the day.
  - The seed uses the same rule.
- **Lend modal:** the preview shows "Borrowed <date · time> · Return by <date>". The success toast shows the dates the **server** saved.

## Phase D: Transactions
- **`components/CopyableText.jsx`:** click-to-copy that shows "TX-2026-000001 copied" and a check mark for 2 seconds. Its click and Enter key do not open the row. It is used for ISBNs and transaction codes, in the tables and in the modals.
- **Clickable rows** (mouse or keyboard) open the new **`TransactionDetailsModal`** (`xl`, full-screen on phones):
  - **Header:** copyable code and status badge.
  - **Book:** zoomable cover, title, authors, copyable ISBN, category, shelf.
  - **Borrower:** avatar, name, member ID, email, contact number, books borrowed right now.
  - **Timeline:** Borrowed (date · time, "Processed by <name>"), Extended (n of 2), Return date, Returned (date · time) or "Not returned yet", and days late.
  - **Footer:** Close, View book (opens the book details on top), Extend, Mark returned (both confirmed).
- **New endpoint:** `GET /api/transactions/:id`.
- **Wording:** "Renew" is now **"Extend"** everywhere you can see it, including server messages. The API routes are still `/renew`.
- **Modal layers:** new layers `.modal-level-1`, `.modal-level-2` and `.modal-top`, plus `utils/modalLevel.js`. A transaction can open over a member, and a book over a transaction. Confirmations and the image zoom are always on top.
- **`server/scripts/backfill.js`** (`npm run backfill`), see "Test results" below for proof:
  - It first raises each counter above the highest number already in use (`$max`).
  - It then numbers missing transaction codes in `borrowedAt` order and missing member IDs in `createdAt` order, each in the year the record was created.
  - Each update only applies if the field is still missing, so it is idempotent and never overwrites or deletes anything.

## Phase E: Members
- **`UserDetailsModal`:** now `size="xl"` (full-screen on phones).
- **Borrowing history** (`components/members/BorrowingHistory.jsx`):
  - The 4 summary numbers, then the shared `DataTable`.
  - Columns: copyable code, book (cover + title), borrowed (date · time), return date, returned (date · time or "—"), status.
  - Its own pager, 10 rows per page.
  - Clicking a row opens the TransactionDetailsModal on top. After a return or extend there, the member's data reloads.

## Phase F: Book form (limits, unsaved changes, cover upload)
### Character limits (client and server identical)
`server/utils/limits.js` and `client/src/utils/limits.js` hold the same numbers.

**Books:**
| Field | Rule |
|---|---|
| Title / subtitle | ≤200 characters |
| Authors | ≤10 authors, each ≤120 characters |
| ISBN | ≤17 typed characters; only digits, X, dashes and spaces can be typed; must be 10 or 13 digits |
| Publisher | ≤120 characters |
| Language | chosen from: English, Filipino, Tagalog, Spanish, French, German, Japanese, Chinese, Other |
| Shelf | ≤10 characters, pattern like `PRG-B4`, automatically upper-cased |
| Description | ≤2000 characters |
| Subjects | ≤15 subjects, each ≤60 characters |
| Year | 4 digits, between 1000 and the current year |
| Pages | 1–9999 |
| Copies | 1–999, and still never below the number currently borrowed |

**Members:** name 80, email 254, contact 13, address 200, notes 500, password 6–72. The 72 applies to Add member, Set password, Register and the profile password.

**How the limits look in the UI:**
- Inputs use `maxLength`, so typing stops at the limit.
- Year, pages and copies use a text field that accepts digits only, because a number field ignores `maxLength`.
- `components/FieldLimit.jsx` shows "120/200" above 80% of the limit, and "Max characters reached" at the limit in the new soft red `--danger-soft` (4.9:1 contrast).

### Unsaved changes
- **Book form:**
  - "Add book" / "Save changes" stays disabled until the normalized form differs from the original (trimmed text, author and subject arrays), or until a new photo is waiting to be uploaded.
  - An "Unsaved changes" hint appears.
  - The browser asks before you close or refresh the page (`hooks/useUnsavedChanges.js`).
  - Cancel and "Back to books" open "Discard unsaved changes?".
- **Member profile edit:** works the same way.

### Cover upload (no third-party services)
**Server:**
- New collection `BookCover` stores the image bytes, type, size, width and height.
- The Book model gets `hasCustomCover` and `coverVersion`.
- **Upload** (multer, held in memory, max 300 KB, field name `cover`, JPEG/PNG/WEBP only): the real type and pixel size are read from the file's magic bytes (`utils/imageInfo.js`), so a renamed or fake file is refused.
- **Delete:** removes the photo; the book falls back to its library cover or initials.
- **Public GET:**
  - Sends the right `Content-Type`.
  - Sets `Cache-Control: public, max-age=31536000, immutable` and an `ETag`, and answers 304 when the browser already has that version.
  - Sets `Cross-Origin-Resource-Policy: cross-origin` on **this route only**, so the image also loads when the website and the API are on different domains.
- Deleting a book deletes its cover.

**Client:**
- `utils/cover.js` and `BookCover` try, in order:
  1. the uploaded photo (`/api/books/:id/cover?v=<version>`)
  2. the stored cover URL
  3. `/covers/{isbn}.jpg`
  4. the initials placeholder

  Each one falls through to the next if it fails to load. In the form, the preview follows the ISBN you type.
- `utils/imageResize.js` prepares the photo in the browser:
  - accepts JPG/PNG/WEBP up to 5 MB
  - rejects images smaller than 200×300 px with a clear message
  - crops the centre to 2:3 and resizes to 300×450 on a `<canvas>`
  - saves a JPEG at quality 0.85, lowering it if needed to stay under 150 KB
- **Form cover section** (`components/books/CoverEditor.jsx`):
  - preview with a "Click to zoom" overlay that opens the lightbox
  - "Upload photo" button and drag-and-drop
  - "Discard new photo" while a photo is waiting
  - "Remove uploaded photo" (asks first) when there is an upload
  - a line saying which source is in use: Uploaded cover / Library cover (from ISBN) / Image from URL / No cover
  - "or use an image URL" as a secondary field
- **Saving:** a new book is created first, then the photo is uploaded. If only the upload fails, the book stays saved, you get an error toast, and the form switches to edit mode so you can try the upload again.

---

## API endpoints (new or changed this round)
| Method | Path | Access | Change |
|---|---|---|---|
| GET | `/api/books` | protect | aggregation; returns `descriptionPreview` / `descriptionLength`; `limit` up to 100 |
| GET | `/api/books/facets` | protect | 5-minute in-memory cache |
| POST / PUT | `/api/books`, `/api/books/:id` | protect + adminOnly | new limits; copies 1–999; language list; shelf pattern |
| DELETE | `/api/books/:id` | protect + adminOnly | also deletes the uploaded cover |
| **PUT** | **`/api/books/:id/cover`** | protect + adminOnly | **new**: upload or replace the cover (multipart field `cover`, ≤300 KB, JPEG/PNG/WEBP by magic bytes) |
| **DELETE** | **`/api/books/:id/cover`** | protect + adminOnly | **new**: remove the uploaded cover |
| **GET** | **`/api/books/:id/cover`** | **public**, read-only | **new**: the image (ETag, long cache, CORP cross-origin) |
| **GET** | **`/api/transactions/:id`** | protect + adminOnly | **new**: details + `borrowerActive` + `daysLate` |
| POST | `/api/transactions` | protect + adminOnly | return date = end of the 14th day |
| PUT | `/api/transactions/:id/renew` | protect + adminOnly | +7 days at the end of the day; messages say "extended" |
| GET | `/api/transactions`, `/api/users` | protect + adminOnly | `limit` up to 100 |
| POST / PUT | `/api/users`, `/api/users/:id`, `/api/users/:id/password` | protect + adminOnly | name 80, email 254, contact 13, password 6–72 |
| POST / PUT | `/api/auth/register`, `/api/auth/profile` | public / protect | name 80, email 254, password 6–72 |

## New npm packages
- **server:** `multer` ^2.4.0 (handles the multipart cover uploads)
- **client:** none

## Files
**Created (server):**
- `middleware/timing.js`
- `models/BookCover.js`
- `utils/imageInfo.js`
- `utils/limits.js`
- `scripts/backfill.js`

**Created (client):**
- `hooks/useListQuery.js`
- `hooks/useUnsavedChanges.js`
- `utils/facetsCache.js`
- `utils/cover.js`
- `utils/imageResize.js`
- `utils/limits.js`
- `utils/modalLevel.js`
- `components/CopyableText.jsx`
- `components/FieldLimit.jsx`
- `components/table/ListArea.jsx`
- `components/admin/LibraryStats.jsx`
- `components/books/BorrowerList.jsx`
- `components/books/ColumnsMenu.jsx`
- `components/books/CoverEditor.jsx`
- `components/books/ZoomableCover.jsx`
- `components/members/BorrowingHistory.jsx`
- `components/transactions/TransactionDetailsModal.jsx`

**Edited (server):**
- `server.js`
- `seed.js`
- `package.json` / `package-lock.json`
- `models/Book.js`
- `routes/auth.js`
- `routes/books.js`
- `routes/transactions.js`
- `routes/users.js`
- `utils/transactionStatus.js`

**Edited (client):**
- `api.js`
- `index.css`
- `styles/admin.css`
- `hooks/useUrlFilters.js`
- `utils/format.js`
- `utils/members.js`
- `components/ConfirmModal.jsx`
- `components/ImageLightbox.jsx`
- `components/table/DataTable.jsx`
- `components/table/TablePager.jsx`
- `components/books/BookCover.jsx`
- `components/books/BookDetailsModal.jsx`
- `components/books/BooksBrowser.jsx`
- `components/books/BooksTable.jsx`
- `components/members/MemberFormFields.jsx`
- `components/members/UserDetailsModal.jsx`
- `components/transactions/LendModal.jsx`
- `pages/Register.jsx`
- `pages/admin/AdminDashboard.jsx`
- `pages/admin/BooksPage.jsx`
- `pages/admin/BookForm.jsx` (rewritten)
- `pages/admin/MembersPage.jsx`
- `pages/admin/TransactionsPage.jsx`

**Deleted:** none.

---

## Test results
All tests ran on a temporary in-memory MongoDB outside the project, never your database.

**Build:**
- `npm run build` (client) passes.
- `node --check` passes on every server file.
- No hex colours outside `index.css`.
- No `bi-` / `bootstrap-icons` left.

**Round 3 API tests: 66 / 66 passed.**
- List payload (preview instead of description, limit 100 allowed and 101 refused).
- Every book and member limit, including copies 999 allowed and 1000 refused, and copies below the borrowed count refused.
- Old imported values kept on edit: an "ITA" language code and a subject longer than 60 characters.
- Cover upload:
  - Accepted: a valid JPEG, a valid PNG that replaces it (still one cover per book), and width/height read from the bytes.
  - Refused:
    - too big → **413**
    - wrong type (`text/plain`) → 400
    - fake extension / fake mimetype → 400 (magic bytes)
    - wrong field name → 400
    - member → 403
    - no token → 401
- Public cover GET: bytes, Cache-Control, ETag, 304, and CORP `cross-origin` only on this route (other routes keep `same-origin`).
- Cover delete: the flags fall back and GET returns 404. Deleting a book deletes its cover.
- Return dates: end of the 14th day, and extending adds 7 days while keeping the end of the day.
- `GET /transactions/:id`: details, days late, 403 for members.
- **Backfill:**
  - The first run filled 2 loans and 2 users. The old loan got `TX-2024-000001`, and the new numbers are above the existing ones (no duplicates).
  - **The second run changed nothing:** a snapshot of the loans, users and counters was identical before and after it.

**Regression API tests from the earlier rounds:** 111 / 114.
- The same 3 known test-script artefacts as last round:
  - the literal ".*" really appears in 11 descriptions
  - a race-dependent member deletion
  - the follow-up step reading that deleted member
- No app failures.

**Browser** (headless Edge, Vite dev server):
- **Page scroll:**
  - 768×1024, 1366×768, 1920×1080: no page scroll on Dashboard, Books, Members or Transactions.
  - 375×812: normal page scroll on purpose, and no horizontal scroll anywhere.
- **Searching:** rows dim with the progress bar, and no skeletons appear.
- **Columns menu** and the "Showing 991–1,000 of 1,000 books" text work.
- **Transactions:**
  - Copying a code shows the toast and does not open the row.
  - The transaction modal timeline is correct.
  - "View book" opens on top; the Extend confirmation and toast work.
  - On a phone the modal is full-screen.
- **Book details:** the borrowers list shows date + time.
- **Members:** the history table shows 10 per page, and its rows open the transaction modal on top.
- **Member profile edit:** Save is disabled until something changes; then the "Unsaved changes" hint appears, and Cancel asks "Discard unsaved changes?".
- **Book form:**
  - Inputs stop at 200 characters, and "Max characters reached" appears in `rgb(181, 83, 74)`.
  - In the ISBN field, letters are removed and only digits/X/dashes/spaces stay; the year stops at 4 digits; the shelf code is upper-cased.
  - A 120×160 image is refused with a clear message.
  - An 800×1000 photo becomes 300×450, uploads on save, and shows in the table and the details modal.
  - The edit page says "Uploaded cover".
  - "Remove uploaded photo" falls back correctly.
  - Cancel while dirty asks first.
- **Lend:** the preview and toast show the borrowed date · time and the return-by date.

**Bug found and fixed by these tests:** closing the member modal while its profile edit had unsaved changes left the browser's "leave page?" guard switched on. Closing the modal now ends the edit.

---

## Not finished / different from the instructions
- **Description tooltip:** the list only receives a 160-character preview (as Phase A asked), so the Description column's tooltip shows those 160 characters plus "…", not the full text. The full text is in the details modal.
- **Old imported data:** 19 books have a subject longer than 60 characters, and many have a language code such as "ITA". These **old values may stay unchanged** when you edit the book; anything new or changed must follow the new rules. The code is shown in the language select as e.g. "Italian (current)".
- **Unsaved-changes warning:** it covers closing or refreshing the tab and the Cancel / Back buttons. It does **not** catch clicks on the sidebar links inside the app. React Router's `useBlocker` needs a "data router" (`createBrowserRouter`), and the app uses `<BrowserRouter>`.
- **"Renew" is now "Extend"** everywhere you can see it (the instructions used "Extend"). The API route is still `/renew`.
- **"Due soon"** remains on the status badge and the new borrowers-list badge, as allowed. The tab and stat card still say "Returning soon".
- **End-of-day return dates** use the **server's** time zone. If the server runs in UTC (common on Render), "end of day" is 23:59 UTC, which is 7:59 AM the next day in the Philippines. Set `TZ=Asia/Manila` in the server's environment to make it local.
- **Covers in the database:** the uploaded files are stored in MongoDB (as asked). Each is about 30–150 KB, which is fine for a school project; a large library would normally use object storage instead.
- **Prefetch and facets caches** are in memory: per browser tab for the client, and per server instance for the server.
