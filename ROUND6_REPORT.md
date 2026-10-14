# Round 6 report: library rules, "Late" wording, archive, login protection

Branch `rebuild`, **not committed**. `.env` was not touched; seed/reset/backfill were **not** run.
As agreed for this round, the app was **not** started and no test scripts were run. The only checks were `npm run build` and `node --check`. Everything that needs the running app is in **Please test manually** at the end.

## Manual steps for you
1. No new packages, so `npm install` is not needed.
2. Restart the API. Mongoose creates the new indexes on start: `Book.isArchived`, and the `LoginActivity` TTL index.
3. Existing database: `cd server && npm run backfill`. This sets `renewCount: 0` on old transactions. It is safe to run many times.
   Or run `npm run seed` for fresh demo data (this wipes the database).

## Changes per fix
1. **"Extension NaN of 2":**
   - A missing `renewCount` is read as 0 everywhere: the row action, the details modal timeline, both confirm texts, the export "Times extended" column and the server limit check.
   - The server's double-click guard also matches a missing value (`$in: [0, null]`).
   - Confirm text: "The return date moves from Oct 9, 2026 to Oct 16, 2026. This is extension 1 of 2."
   - `backfill.js` sets `renewCount: 0` where it is missing (only missing/null values are touched).
2. **No extending late books:**
   - `PUT /renew` returns 400 "Late books can't be extended. Mark it returned first." for a late book, and 400 "This book was already extended 2 times." at the limit.
   - An extension still adds 7 days to the current return date and keeps the end of that day.
   - The Extend buttons (table row and details modal) are disabled with that reason as the tooltip, on a focusable wrapper.
   - Mark returned and Extend always have tooltips.
3. **No borrowing while a book is late:**
   - `POST /api/transactions` returns 400 "Juan Dela Cruz has 1 late book. It must be returned before borrowing more." ("2 late books. They must…" for more than one).
   - It also refuses archived books.
   - In the LendModal, such members show a soft "Has late books" badge and can't be selected; a tooltip gives the reason. Members at 5 books get a tooltip too.
4. **"Late" wording:**
   - "Unreturned" is now "Late" on the badge, the tab, the stat cards on Dashboard / Books / Transactions ("Late books", "Past the return date"), the dashboard card ("Late books to follow up"), the Members filter and chip ("Has late books"), the Members stat card ("With late books"), the member column ("3 books · 1 late"), the member history, and the export status labels and filter descriptions.
   - "Nothing due in the next days" was also reworded to "Nothing to return in the next days".
   - The wording is centralised in `client/src/utils/labels.js` and `server/utils/labels.js`. `utils/transactions.js`, `format.js` (`dueText`) and `server/utils/transactionStatus.js` read from them.
5. **Archive instead of delete:**
   - **Book model:** `isArchived` (indexed), `archivedAt`, `archivedBy`.
   - **New endpoints:** `PUT /api/books/:id/archive` and `/restore`, logged as `book_archived` / `book_restored`.
   - **DELETE:** refused for any book with transactions; archiving is blocked while copies are borrowed.
   - **UI:** a book with `timesBorrowed > 0` shows Archive instead of Delete in row actions, cards and the details modal, with the requested confirm text. If the server finds history anyway, the dialog switches to Archive.
   - **Hidden by default from:** the books list, facets, author autocomplete, LendModal, all stats, "Most borrowed" and the category donut.
   - **"Show archived books" switch** in Filters (URL `?archived=include`, admin only; the server ignores it for members). Archived rows show an "Archived" badge and Restore; archived books can't be lent.
   - **Export / import:** export follows the switch (plus a new "Archived" column). Import duplicate checks include archived ISBNs ("Archived in library").
   - **Members:** DELETE is refused with any history ("This member has borrowing history. Deactivate the account instead."); the Delete button is disabled with that tooltip.
6. **Deactivate warning:** the confirmation fetches the member's current counts when it opens (a skeleton line shows while they load), then reads "Juan Dela Cruz still has 2 borrowed books (1 late). They won't be able to log in, but the books stay on their record."
7. **Login protection** (`routes/auth.js`):
   - Login: 10 **failed** attempts per 15 min per IP + lower-cased email, and 50 failed per 15 min per IP (`skipSuccessfulRequests`).
   - A blocked login gets 429 "Too many failed attempts. Try again in 14 minutes." (minutes from the reset time, at least 1).
   - Register: 20 per hour per IP.
   - The old app-level 100 / 15 min limiter was removed from `server.js`.
   - The Login page already shows the server message, and the button is never locked.
8. **Retention:** a TTL index on `LoginActivity.createdAt` deletes login records after 90 days, with an RA 10173 comment. No TTL on ActivityLog.
9. **New category:**
   - "+ New category…" in the select opens a text input: Title Case while typing, ≤ 50 characters with a counter, and Cancel.
   - A case-insensitive duplicate shows "'Fiction' already exists. Use 'Fiction'".
   - The server (`checkCategory`) refuses case-only duplicates and saves new categories in Title Case.
   - The facets cache is cleared on the server (already) and in the client after saving.
10. **One stats source:**
    - `server/utils/libraryStats.js` provides titles, copies, available, borrowed now, active, due soon, late, and active/total members, with archived books excluded.
    - It is used by `/api/dashboard`, `/api/transactions/stats` (now returns `late` instead of `overdue`) and the new `GET /api/stats`, which replaces `/api/stats/admin`.
    - `LibraryStats.jsx` calls `/stats`.
11. **Toasts:** bottom-right, with spacing that includes `env(safe-area-inset-bottom)`, and full width at the bottom on phones. They slide up from below; replace-instead-of-stack is unchanged.

## Endpoints (new or changed)
| Method | Path | Access | Change |
|---|---|---|---|
| PUT | `/api/books/:id/archive` | protect + adminOnly, isMongoId | new |
| PUT | `/api/books/:id/restore` | protect + adminOnly, isMongoId | new |
| DELETE | `/api/books/:id` | admin | refused when the book has any transactions |
| DELETE | `/api/users/:id` | admin | refused when the user has any transactions |
| GET | `/api/books` | protect | archived hidden; `archived=include` (admin only) shows them |
| GET | `/api/books/facets`, `/api/books/authors` | protect | archived books excluded |
| POST | `/api/books`, PUT `/api/books/:id` | admin | category: no case-only duplicates, new ones in Title Case |
| POST | `/api/transactions` | admin | refused for members with a late book, and for archived books |
| PUT | `/api/transactions/:id/renew` | admin | refused for late books; missing renewCount = 0 |
| GET | `/api/transactions/stats` | admin | uses `libraryStats`; `overdue` renamed to `late` |
| GET | `/api/dashboard` | admin | uses `libraryStats`; `stats.lateReturns` renamed to `stats.late` |
| GET | `/api/stats` | admin | new (replaces `/api/stats/admin`, which was removed) |
| POST | `/api/auth/login` | public | 10 failed / 15 min per IP + email, 50 failed / 15 min per IP |
| POST | `/api/auth/register` | public | 20 / hour per IP |
| POST | `/api/export/books` | admin | follows `filters.archived`; new "Archived" column |
| POST | `/api/books/import/preview`, `/commit` | admin | archived ISBNs count as duplicates ("Archived in library") |

## Files
**Created:**
- `server/utils/labels.js`
- `server/utils/libraryStats.js`
- `client/src/utils/labels.js`

**Edited, server:**
- `server.js`
- Routes: `routes/auth.js`, `routes/books.js`, `routes/bookImport.js`, `routes/dashboard.js`, `routes/stats.js` (rewritten), `routes/transactions.js`, `routes/users.js`
- Models: `models/Book.js`, `models/ActivityLog.js`, `models/LoginActivity.js`
- Other: `queries/books.js`, `export/columns.js`, `export/describe.js`, `utils/transactionStatus.js`, `scripts/backfill.js`

**Edited, client:**
- Pages: `pages/Login.jsx`, `pages/admin/AdminDashboard.jsx`, `pages/admin/BookForm.jsx`, `pages/admin/MembersPage.jsx`, `pages/admin/TransactionsPage.jsx`
- Book components: `components/books/BookActions.jsx` (rewritten), `BookCards.jsx`, `BookDetailsModal.jsx`, `BookFiltersOffcanvas.jsx`, `BooksBrowser.jsx`, `BooksTable.jsx`, `ImportPreviewModal.jsx`
- Other components: `components/admin/LibraryStats.jsx`, `components/dashboard/ListCards.jsx`, `components/members/BorrowingHistory.jsx`, `components/members/UserDetailsModal.jsx`, `components/transactions/LendModal.jsx`, `components/transactions/TransactionDetailsModal.jsx`
- Utils, context and styles: `utils/transactions.js`, `utils/format.js`, `utils/books.js`, `utils/activity.js`, `context/ToastContext.jsx`, `index.css`, `styles/admin.css`

**Docs:** `README.md`, `../REBUILD_SUMMARY.md`, this report.
**Deleted:** none.

## Checks
- `npm run build` (client): passes.
- `node --check` on every changed server file: passes.
- Not run: the app itself, API tests and UI tests (as requested).

## Notes / decisions
- The buttons decide "has history" from `Book.timesBorrowed > 0`; the server always checks the real transactions.
- The borrowed-vs-returned chart still counts past borrowings of archived books, because history is kept. Catalog numbers, "Most borrowed" and the category donut leave archived books out.
- After a member is blocked, more attempts still count toward the 50-per-IP cap. This is intended, so hammering keeps the block.

## Please test manually
1. **Old transaction:** with an old transaction that has no `renewCount` (before running backfill), open Extend → the text says "This is extension 1 of 2" (no NaN). Run `npm run backfill` → it prints how many got `renewCount 0`.
2. **Extend a late book** (Transactions → Late tab): the Extend icon is disabled and its tooltip says "Late books can't be extended. Mark it returned first." The same applies in the details modal.
3. **Extend twice:** extend one book 2 times → the 3rd Extend is disabled: "This book was already extended 2 times."
4. **Lending with a late book:** lend to `juan@gmail.com` while he has a late book. In New transaction, he shows "Has late books", can't be clicked, and has a tooltip. Calling the API directly → 400 with the message above.
5. **Archive:** take a book that was borrowed before, with no copies out → Delete becomes Archive, with the confirm text. After archiving, it is gone from the list, the Category filter and the New transaction book picker, and the "Book titles" count drops by 1. With Filters → "Show archived books", it is listed with an "Archived" badge → Restore brings it back.
6. **Never-borrowed book:** Delete still deletes permanently.
7. **Archiving blocked while borrowed:** a book with a copy out → Archive is disabled with "Cannot archive: 1 borrowed".
8. **Export:** export Books with the switch on → archived rows have "Archived: Yes". With it off, they are not in the file.
9. **Import:** import a CSV containing the ISBN of an archived book → it appears under "Already in library" as "(archived)", and the error report says "Archived in library".
10. **Member delete:** open a member who borrowed before → Delete is disabled with "This member has borrowing history. Deactivate the account instead." Create a new member → Delete works.
11. **Deactivate warning:** deactivate a member with books → a skeleton line shows briefly, then "… still has 2 borrowed books (1 late) …".
12. **Wrong passwords:** 11 wrong passwords for the same email → the 11th says "Too many failed attempts. Try again in 15 minutes." Logging in to another account from the same computer still works. The correct password for the blocked email only works after the time passes.
13. **Register limit:** register 21 accounts within an hour from one computer → the 21st is refused.
14. **Wording:** no "Unreturned" anywhere. Check the stat cards on Dashboard / Books / Transactions ("Late books"), the Late tab, the dashboard card "Late books to follow up", the members table ("3 books · 1 late") and the Members filter ("Has late books").
15. **Same numbers everywhere:** the late count is identical on Dashboard, Books and Transactions.
16. **New category:** Book form → "+ New category…" → type "graphic novels" → it becomes "Graphic Novels" and saves; the new category appears in the Books Category filter. Typing "fiction" shows "Fiction already exists. Use 'Fiction'".
17. **Toasts:** they appear bottom-right and slide up; on a phone, full width at the bottom, above the browser bar.
18. **Retention:** in MongoDB (Compass), the `loginactivities` collection has an index on `createdAt` with `expireAfterSeconds: 7776000`.
