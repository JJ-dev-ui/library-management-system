# Round 5 report: scale, row selection, export, bulk upload, README

Branch `rebuild`, **not committed** (you commit after each round). No `.env` file was touched, and `npm run seed` / `reset` / `backfill` were **not** run against your database. Every test used a temporary in-memory MongoDB outside the project.

## What you need to do manually
1. `cd server && npm install`. This installs **exceljs** and **pdfkit** (both new; they are already in `package.json`). The client has no new packages.
2. Optional: `cd server && npm run seed` gives fresh demo data. It is not required: nothing in the database format changed.
3. Restart the API (`npm run dev`). `server.js` changed: new routes, CORS header and JSON limits.
4. Add screenshots to `docs/screenshots/` with the file names used in the README (`dashboard.png`, `books.png`, `transactions.png`, `members.png`, `export.png`, `import.png`).
5. Deployment: set the `.env` values from the README table on the host (including `TZ=Asia/Manila`), and set `VITE_API_URL` for the client build.

## Quick fixes (asked before the phases)
1. **"Current theme" badge**:
   - The badge is gone. A small, regular-weight grey note "Current theme" now sits **under** the theme name, and the gap between the cards is wider.
   - **Toast spam:** a toast with the same message (or the same `id`, e.g. theme saves) replaces the old one, so 4 quick theme saves show 1 toast. At most 4 different toasts are visible at once.
2. **Toast animation**: a soft entrance and exit (opacity + a 16px slide, 240 ms) through Bootstrap's `.fade` / `.showing` classes, plus `onExited` cleanup so the exit animation finishes before the toast is removed.
3. **Profile**: role, member ID and member since were removed; only the email is shown as read-only.
4. **Book form, Authors and Subjects** now work like Title / Subtitle:
   - The new `ListFieldLimit` shows "N/10 authors · longest x/120" when you get close to a limit.
   - "Max authors reached" or "Max characters reached for one author" appears in soft red.
   - Typing stops at the limit (`clampList`).
   - Old, longer subjects already on a book are kept.

## Phase 0: Global scale and buttons
- **Scale and spacing**:
  - Root font size 15px.
  - Tighter table cells (th 8/12, td 10/12), stat cards (min-height 96), toolbars (12/16) and modals (`--bs-modal-padding: 1.25rem`).
  - Page title 1.35rem; sidebar 232px (248px on phones); cover thumbnails 32×46.
- **Text and touch targets**: every font size under 0.8rem was raised to 0.8rem (12px), except the decorative mini theme previews. On touch screens (`pointer: coarse`), small buttons, page links and icon buttons are at least 36×36.
- **Poppins everywhere**: buttons, inputs, tooltips, popovers, toasts, dropdowns, modals and offcanvas panels, plus `svg text`. Recharts also gets `fontFamily` from `useThemeColors().font` on axis ticks, tooltips and legends.
- **Icons removed from text buttons** in:
  - AddBookMenu, BookDetailsModal, BooksBrowser, ColumnsMenu, CoverEditor
  - UserDetailsModal, ProfileSettings, SecuritySettings, TransactionDetailsModal
  - AdminDashboard, BookForm, MembersPage, TransactionsPage
  
  Dropdown carets, icon-only buttons, the sidebar, the search icon and empty states keep their icons.

## Phase 1: Row selection (Books table + cards, Members, Transactions)
- `hooks/useSelection.js`:
  - Keeps a `Set` of ids that survives page changes.
  - Shift+click selects a range.
  - The header checkbox selects or clears the page.
  - "Select all N matching" is supported (`allMatching`).
  - The selection is cleared when search, filters or sort change. The quiet note "Selection cleared because filters changed" hides itself after 4 seconds.
- `components/table/RowCheckbox.jsx`: a Bootstrap checkbox with the indeterminate state (set through a ref). Its clicks never open the row's modal.
- `components/table/SelectionBar.jsx`:
  - The bar reads "12 selected · Export · Clear".
  - When the whole page is ticked: "All 10 on this page are selected. Select all 1,000 matching".
  - After choosing all matching: "All 1,000 matching books are selected." + "Clear selection".
- `DataTable` has a `selection` prop (a checkbox column, highlighted selected rows), and so does `BookCards` (checkbox in the corner of each card).
- The Dashboard has no checkboxes.
- `BooksBrowser` reports its state (filters, page, selection) to the Books page through `onState`. The page keeps it in a **ref**, because storing it in state would cause a render loop.

## Phase 2: Export
### Server: `POST /api/export/:entity`
- **Access and limits**:
  - `entity`: `books` | `members` | `transactions`; protect + adminOnly.
  - Rate limit **20 per 10 minutes per librarian**, keyed by user id (librarians on the school network share one IP).
- **Validation**: express-validator on the whole body: `format` (csv / xlsx / pdf), `scope` (selected / page / filtered), `ids` (Mongo ids, 1–10,000, required for "selected"), `filters`, `sort`, `page`, `limit`. `matchedData` drops unknown keys.
- **Same query as the list:**
  - The filter rules, filter builders and sort whitelists moved from the routes into `server/queries/books.js`, `transactions.js` and `users.js`.
  - `GET /api/books`, `/api/users`, `/api/transactions` and the export all call the same functions. The rules take a `field` factory: `query(name)` for lists, `body('filters.' + name)` for the export.
- **Caps**:
  - 10,000 rows for CSV/Excel and 2,000 for PDF, checked with a count first.
  - Over the cap the server returns 400, e.g. "1,234 books match. PDF exports are limited to 2,000 rows — choose CSV or Excel, or narrow the filters."
- **Response**:
  - `Content-Type`, plus `Content-Disposition: attachment; filename="stacks-books-2026-10-14-0912.xlsx"` (Manila time).
  - `X-Export-Count` (row count for the toast) and `Cache-Control: no-store` (the file can hold personal data).
  - CORS `exposedHeaders: ['Content-Disposition', 'X-Export-Count']`.
- **Privacy (RA 10173)**: the column lists (`export/columns.js`) never include the password, tokenVersion, avatarKey or IP addresses. The member query also removes them, and the export drops `avatarKey` / `lastLoginIp` again.
- **Fields**: exactly the lists you gave.
  - Members also get Total borrowed and Returned on time % (one grouped query for all exported members).
  - Transactions: status uses the UI labels ("Unreturned", not "overdue"); days late is calculated like the details modal.
  - PDF: only the key columns you listed ("Available/Total" as "3 / 5").
  - All dates are in Asia/Manila.
- **CSV** (`export/csv.js`): UTF-8 BOM, RFC 4180 quoting, CRLF line endings. Text cells starting with `= + - @`, tab or CR get a leading `'`; the comment in the file explains the formula-injection risk.
- **Excel** (`export/xlsx.js`, exceljs):
  - Header row: bold white text on the librarian's **current theme colour** (NU blue by default).
  - Frozen header, autofilter and column widths; long text wraps.
  - Real date cells showing Manila time, and numbers stored as numbers.
  - Sheet 2 "Report info": report name, generated at, generated by (name + email), scope, filters, row count.
- **PDF** (`export/pdf.js`, pdfkit):
  - A4 landscape. Header: "Stacks Library" + title, generated at/by, scope, filters.
  - The table header repeats on every page; zebra rows; long text wraps to 2 lines and ends with "…".
  - Footer "Page X of Y" (bufferPages).
  - **Noto Sans Regular + Bold** are embedded from `server/assets/fonts/` (`OFL.txt` = licence), so ñ, accents and Greek print.
- **Activity log**: new type `data_exported`, meta `{ entity, format, scope, count }`. Recent activity shows "Exported 1,000 books as Excel".
- **JSON limits**: `server.js` keeps the global 10 KB limit but skips it for `/api/export` and `/api/books/import/commit`, which set their own limits.

### Client
- An **Export** outline button sits directly left of Add book / Add member / New transaction. The selection bar has its own Export button too.
- `components/table/ExportModal.jsx`:
  - Format radio cards: CSV / Excel / PDF.
  - Scope: Selected (N), the default when something is selected; Current page (N); All matching current filters (N), the default otherwise.
  - A summary of the active filters, and the PDF note.
  - A warning when the count is over the cap (the button is disabled).
  - Spinner button; automatic download using the file name from the header; toast "Exported 1,000 books as Excel"; server errors shown inside the modal.
  - "All matching" selected → the export is sent by filters, not as 1,000 ids.
- `utils/download.js` (`saveBlob`, `fileNameFrom`, `blobErrorMessage`). axios uses `responseType: 'blob'`.

## Phase 3: Bulk upload (`/admin/books/import`, replaces ComingSoon)
- **Templates**: `GET /api/books/import/template?format=csv|xlsx` (admin).
  - The 13 headers you listed; required ones end in `*`.
  - XLSX: styled header, ISBN column formatted as text (so Excel keeps leading zeros), 2 example rows in grey, and an **Instructions** sheet with every column's rules.
- **Preview**: `POST /api/books/import/preview` (admin; multer memory, 2 MB, 1 file).
  - **File type**: extension AND magic bytes. `.xlsx` must start with `PK\x03\x04` (ZIP); a ZIP renamed to `.csv` is rejected; CSV must contain no NUL bytes (so it really is text). Damaged XLSX files give a clear 400.
  - **Reading**: quote-aware CSV parser (commas and line breaks inside quotes, `""`). UTF-8 with or without BOM, with a Windows-1252 fallback for older Excel.
  - **XLSX values**: dates, numbers, rich text, hyperlinks and formula **results** are read (formulas are never calculated).
  - **Headers**: matched without case, spaces or `*`. Unknown columns are listed as "Ignored columns"; missing required columns give a 400 naming them; missing optional ones are listed.
  - **Row limits**: up to 1,000 data rows; empty lines are skipped.
  - **Validation** (`import/validate.js`, same numbers as the form via `utils/limits.js`):
    - **Required:** ISBN, Title, Authors.
    - **ISBN:** stripped of spaces/dashes; 10 or 13 digits with a valid **check digit** (`utils/isbn.js`). If Excel stored it as a number and dropped a leading 0, the 0 is added back with a warning.
    - **Year:** a year or a full date (only the year is kept), from 1000 to the current year.
    - **Numbers:** pages 1–9999; copies 1–999 (blank = 1); category ≤ 50 (blank = "Uncategorized").
    - **Language:** matched without case; an unknown one becomes "Other" with a warning.
    - **Shelf:** must look like PRG-B4, otherwise it is left blank with a warning.
    - **Text lengths:** title, authors and subjects follow the limits in `utils/limits.js`.
  - **Duplicates**:
    - Already in the library: "Already in library", skipped. This also catches the ISBN-10 form of a stored ISBN-13 and the other way round.
    - Repeated in the file: the first is kept, the others are "Duplicate in file".
  - **Response**: counts, plus the `ready` / `alreadyInLibrary` / `duplicatesInFile` / `errors` (row number + reasons) / `warnings` lists. Nothing is saved.
- **Preview modal** (`components/books/ImportPreviewModal.jsx`; xl, full screen on phones):
  - Count chips and one tab per group, each with a compact table (sticky header; the first 300 rows are drawn).
  - **Download error report**: an injection-safe CSV of every skipped, invalid or changed row (`utils/csv.js`).
  - Cancel / **Import N books**.
- **Commit**: `POST /api/books/import/commit` (route JSON limit 3 MB).
  - Type checks with express-validator, then **every rule and duplicate check runs again** (the browser could have changed the rows).
  - Saves with `insertMany(..., { ordered: false })`, with `availableCopies = totalCopies`.
  - **Cover**: if `data/books.json` has a cover for the ISBN (or its ISBN-10/13 twin), it is used.
  - A race with another librarian (unique index) counts as skipped.
  - Clears the facets cache; logs `books_imported` with `{ imported, skipped, errors, fileName }`.
  - Returns imported / skipped / invalid.
- **Result screen**: "Imported 87 books", skipped and error counts, **View imported books** (Books page with `?addedWithin=today&sort=newest`) and **Import another file**. The client facets cache is cleared too.
- **Rate limit**: 10 per 10 minutes per librarian, separately for preview and commit.
- **Recent activity**: shows "Imported 87 books · 3 skipped".

## Phase 4: README
- `library-mern/README.md`:
  - Title, overview (MERN, Advanced Web Programming, NU MOA theme), team.
  - Features and roadmap (member portal, reservations, late fines).
  - Tech stack table, Mermaid architecture diagram, folder tree.
  - Getting started: `.env` table with placeholders only, seed, run, demo accounts.
  - Scripts table, API reference, Security section, requirements coverage table.
  - Screenshot placeholders, Open Library and Noto Sans credits.
- `docs/screenshots/.gitkeep` created.

## API endpoints (new or changed)
| Method | Path | Access |
|---|---|---|
| POST | `/api/export/books\|members\|transactions` | admin, 20 / 10 min per librarian, 300 KB JSON |
| GET | `/api/books/import/template?format=csv\|xlsx` | admin |
| POST | `/api/books/import/preview` (multipart field `file`) | admin, 10 / 10 min, 2 MB |
| POST | `/api/books/import/commit` | admin, 10 / 10 min, 3 MB JSON |
| GET | `/api/books?addedWithin=today` | protect (new "Today" value) |

The list endpoints `GET /api/books`, `/api/users` and `/api/transactions` work as before; their code now uses `server/queries/*`.

## New npm packages
| Where | Package | Why |
|---|---|---|
| server | `exceljs` ^4.4.0 | Excel export, XLSX template, reading uploaded XLSX |
| server | `pdfkit` ^0.20.2 | PDF export |
| client | none | |

## Files
**Server, new**
- `queries/books.js`, `queries/transactions.js`, `queries/users.js`: shared filter rules, builders and sorts.
- `export/columns.js`, `export/describe.js`, `export/csv.js`, `export/xlsx.js`, `export/pdf.js`.
- `import/parse.js`, `import/validate.js`.
- `routes/export.js`, `routes/bookImport.js`.
- `utils/manila.js` (Manila dates, file stamps), `utils/isbn.js` (check digits, ISBN-10 ↔ 13).
- `assets/fonts/NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`, `OFL.txt`.

**Server, changed**
- `server.js`: per-route JSON limits, CORS exposed headers, mounts `/api/books/import` (before `/api/books`) and `/api/export`.
- `routes/books.js`, `routes/users.js`, `routes/transactions.js`: use `queries/*`; `clearFacetsCache` is exported.
- `models/ActivityLog.js`: types `data_exported` and `books_imported`.
- `seed.js`: when it runs before 8 AM Manila, "today" borrowings move to yesterday (found by a test at 4:47 AM).
- `package.json`: exceljs and pdfkit.

**Client, new**
- `hooks/useSelection.js`.
- `components/table/RowCheckbox.jsx`, `SelectionBar.jsx`, `ExportModal.jsx`.
- `components/books/ImportPreviewModal.jsx`, `components/ListFieldLimit.jsx`.
- `pages/admin/BookImportPage.jsx`.
- `utils/download.js`, `utils/csv.js`.

**Client, changed**
- `App.jsx`: import route.
- `context/ToastContext.jsx`: replace instead of stack, animation.
- `index.css`, `styles/admin.css`: scale, Poppins, selection, export and import styles.
- `components/table/DataTable.jsx`, `components/books/BookCards.jsx`, `BooksTable.jsx`, `BooksBrowser.jsx`: selection.
- `pages/admin/BooksPage.jsx`, `MembersPage.jsx`, `TransactionsPage.jsx`: Export button + modal.
- `pages/admin/BookForm.jsx`: authors/subjects limits; icon removal.
- `components/settings/AppearanceSettings.jsx`, `ProfileSettings.jsx`.
- `components/dashboard/ListCards.jsx` + `utils/activity.js`: export/import rows in Recent activity.
- `components/dashboard/BorrowChart.jsx`, `DonutCard.jsx`, `hooks/useThemeColors.js`: chart font.
- `components/skeletons/TableSkeleton.jsx`: 32px covers, checkbox skeleton.
- `utils/books.js`: "Today" in Date added. `utils/members.js`: "Most loans" → "Most borrowed now" (wording rule).
- Icon removal in the components listed in Phase 0.

**Deleted**: `client/src/pages/admin/ComingSoon.jsx` (its only use was the bulk-upload route).

**Docs**: `README.md`, `docs/screenshots/.gitkeep`, this report, and `../REBUILD_SUMMARY.md` (Round 5 section, API table, file maps, "Not done yet").

## Test results
All tests ran on a temporary in-memory MongoDB filled by `seed.js`, with the real `server.js` and, for the UI, the Vite dev server + headless Edge. The test scripts live outside the project.

| Suite | Result |
|---|---|
| `npm run build` (client) | OK after every phase |
| `node --check` on every server file | OK |
| Round 5 API: export + import | **143 / 143** |
| Round 5 UI (4 screen sizes, selection, export, import, quick fixes) | **139 / 139** (+ 42 / 42 on the final re-run of the flows) |
| Round 4 API (seed, dashboard, activity, settings) | 90 / 90 |
| Round 3 API (lists, details, covers, limits) | 66 / 66 |

**Export tests (83)**:
- Every entity × format × scope:
  - Status, file name pattern, row count, exact headers.
  - **Same rows and order as the list** (page scope compared id-by-id).
  - BOM, styled Excel header in the theme colour, frozen row, autofilter, Report info sheet, PDF "Page 1 of N".
- 8 filter combinations match the list totals and order. Includes "Date added: Today", members with unreturned books, and transactions search.
- **Data**:
  - Excel dates are real dates in Manila time; days late are numbers.
  - "overdue" is exported as "Unreturned".
  - Member stats (total borrowed, on-time %) are correct.
  - Authors are joined with "; ".
- **CSV injection**: `=HYPERLINK(...)`, `+SUM`, `@cmd` and `-Danger` get a leading `'`. Quotes, commas and line breaks survive. In Excel they are plain text cells, not formulas.
- **Privacy**: member exports in all 3 formats contain no bcrypt hash, no tokenVersion, no avatarKey and no IP. A test IP and avatar key were planted first, to be sure.
- **PDF**: prints "Ñandú", "Peña Núñez" and the Greek "Ελληνική" and "Σωκράτης"; the header shows the filters and "generated by name (email)"; key columns only.
- **Validation and access**: 13 bad bodies → 400, including an unknown entity, operator objects, non-whitelisted sorts, year to < year from and bad dates. Member → 403, no token → 401, unknown keys ignored.
- **Size limits**: other routes still 413 above 10 KB; 10,000 ids accepted; 10,001 ids → 400; export body > 300 KB → 413.
- **Caps**:
  - PDF with 10,001 matches → 400; CSV with 10,001 → 400.
  - Exactly 10,000 rows as Excel → 200 (1.4 s, 643 KB).
  - Exactly 2,000 rows as PDF → 200 (0.85 s, 84 pages).
- **Rate limit**: 20 → then 429; another librarian is unaffected. Every export is logged as `data_exported`, and it appears in dashboard recent activity.

**Import tests (60)**:
- **Templates**: CSV headers + BOM. XLSX sheets, styling, ISBN as text, and the template itself previews cleanly (2 ready). Member → 403 on all three routes; no token → 401.
- **Valid rows**: ISBN with dashes/spaces cleaned; authors split by ";"; a date becomes a year; "filipino" → "Filipino"; shelf upper-cased; blank copies → 1; blank category → "Uncategorized"; a quoted multi-line description with commas is kept.
- **Warnings**: unknown language → "Other"; a bad shelf is left empty.
- **12 error rows**, each with the right reason: missing title/authors/ISBN, wrong check digit, 11 digits, year 3000, pages 0 or "many", 1,000 copies, 11 authors, title 201 characters, subject 61 characters.
- **Duplicates in the file** are caught, including the ISBN-10 form of an ISBN-13 already in the file. **Already in library** is caught, including by ISBN-10. Counts add up, and the preview saves nothing.
- **XLSX**: a numeric ISBN gets its leading 0 back; rich text, date cells, formula results and a numeric title ("1984") are read correctly; the "Instructions" sheet is skipped.
- **Bad files** (all 400 with a clear message):
  - a PNG renamed `.xlsx`, an XLSX renamed `.csv`, a `.txt` file, binary data in a `.csv`
  - a broken ZIP, an empty file, missing required columns, headers only
  - Also: over 2 MB → 413; 1,001 rows → 400; exactly 1,000 rows → 200 (21 ms).
- **Commit** with tampered rows:
  - A duplicate, a bad checksum, a 300-character title and an existing ISBN are re-checked and skipped.
  - `availableCopies: 99`, `timesBorrowed: 50` and `_id` are ignored.
  - The books.json cover is used.
  - The facets cache is cleared (the new category appears) and "Date added: Today" lists the imported books.
  - The activity log meta is right; committing the same rows again imports 0; 1,000 books commit in one go.
  - 6 bad bodies → 400.
- **Rate limit**: preview 10 → then 429; commit has its own limit.

**UI tests (139)**:
- **4 screen sizes** (375 and 768 with touch, 1366, 1920) × 7 pages:
  - No horizontal scroll; root font 15px; Poppins; smallest text ≥ 12px.
  - No icons in text buttons; touch targets ≥ 36px on touch screens.
  - Chart tick labels use Poppins.
- **Books table**:
  - Shift+click range (4) and the indeterminate header.
  - Banner "All 10 on this page…" → "Select all 1,000 matching" → "All 1,000 matching books are selected"; the selection survives a page change.
  - Export modal defaults to Selected (1,000); download `stacks-books-…xlsx` + toast "Exported 1,000 books as Excel".
  - Typing a search clears the selection with the note.
- **Cards**: the checkbox selects without opening the card; it still works at 375px.
- **Members/Transactions**: 2 selected; Export sits left of the main button; Excel/PDF download + exact toast. The header Export defaults to "All matching", with Selected disabled.
- **Import page**:
  - The template downloads; uploading a CSV shows the preview chips "13 ready · 0 already in library · 1 duplicate in file · 2 errors · 1 warning".
  - The Errors tab shows the reasons; the error report downloads; the 375px preview fits the screen.
  - Import → "Imported 13 books · 1 skipped · 2 with errors not imported" → View imported books (Today, newest).
  - A fake `.xlsx` shows the error message.
- **Dashboard**: recent activity shows "Imported 13 books · 1 skipped" and "Exported 2 transactions as PDF".
- **Quick fixes**: 4 quick theme saves → 1 toast; the toast has an opacity/transform transition; the "Current theme" note is not bold; the profile has no role / member ID / member since; an author name stops at 120 characters, with the message.

## Fixed during testing
- "1 warnings" chip → singular/plural labels ("1 warning", "2 duplicates in file").
- On phones, the import error reasons were squeezed into a narrow column. They now keep a readable width and the table scrolls sideways. The footer button no longer touches the edge.
- The seed at 4:47 AM Manila placed "today" borrowings before library hours (Round 4 check failed). Fixed in `seed.js`, and Round 4 passes again.
- Members "Last login: Today" used the server's local midnight; it now uses Manila midnight like the rest.
- Wording rule: the Members sort "Most loans" is now "Most borrowed now".

## Deviations and notes
- **Export JSON limit is 300 KB, not 100 KB.** 10,000 Mongo ids are about 270 KB of JSON, so 100 KB would only allow about 3,700 selected ids. All other routes keep 10 KB.
- **Import commit JSON limit is 3 MB, not 2 MB.** 1,000 books with full 2,000-character descriptions can be about 2.6 MB.
- **Extra response header** `X-Export-Count`, so the toast shows the real number of rows exported.
- **Excel header colour**: it follows the librarian's chosen theme (NU blue by default) instead of always NU blue.
- **CSV template** has headers only; the 2 example rows are in the XLSX template, so a CSV user never imports examples by accident.
- **ISBN-10 / ISBN-13 twins** are treated as the same book for duplicates (in the file and in the library). The ISBN is saved in the form the file used.
- **Preview limits**: the preview table draws at most 300 rows per tab for speed; the import and the error report always use every row.
- **Toast position**: toasts stay in the top-right corner (unchanged), so for about 4 seconds a toast can cover the header buttons. Moving them to the bottom-right would avoid that; tell me if you want it.
- **Oldest test suite** (`run.js`, Round 1): it expects the original 4-user seed, so its count checks fail on the Round 4 seed. Its important security check still holds: searching ".*" matches only the 11 books that literally contain ".*". Rounds 3–5 cover the same features with the current seed.
