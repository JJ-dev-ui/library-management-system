# Round 4 report: activity log, realistic seed, dashboard, settings and themes

Branch `rebuild`, **not committed**. No `.env` file was touched, and `npm run seed` / `reset` / `backfill` were **not** run against the real database. All tests used a temporary in-memory MongoDB outside the project.

## What you need to do manually
1. `cd client && npm install`. This installs **recharts** (new) and is needed because `package.json` changed.
2. `cd server && npm install` (no new server packages this round, but run it if multer from round 3 isn't installed yet).
3. `cd server && npm run seed`. It wipes the database and creates the new demo data (31 users, 300 transactions, activity log, login history).

**Logins** (unchanged, plus one new librarian):

| Account | Password | Notes |
|---|---|---|
| `admin@gmail.com` | `admin123` | librarian |
| `librarian2@gmail.com` | `admin123` | new librarian |
| `member@gmail.com` | `member123` | |
| `juan@gmail.com` | `member123` | |
| `maria@gmail.com` | `member123` | deactivated |
| every other seeded member, e.g. `andrea.reyes@gmail.com` | `member123` | |

4. **Optional:** set `TZ=Asia/Manila` on the hosting server (see round 3), so "end of day" return dates match the Philippine day.

---

## Phase 0: Cleanup
- Deleted the outdated `library-mern/README.md`. `REBUILD_SUMMARY.md` and `ROUND3_REPORT.md` are kept.
- Installed **recharts** ^3.10 in `client/`.
- The dashboard page (which contains the charts) is now **lazy-loaded** (`React.lazy` in `App.jsx`). The chart code only downloads when the dashboard opens, and the build no longer warns about bundle size.

## Phase 1: Activity log (audit trail)
- **`models/ActivityLog.js`:**
  - Fields: `type` (13-value enum), `actor`, `member`, `book`, `transaction` (refs), `meta` (small object), `createdAt`.
  - Indexes on `createdAt` (newest first) and `type + createdAt`.
- **`utils/activity.js`:** `logActivity({...})`. It **never throws**; if saving the log fails it only prints the error, so the real action always succeeds.
- **What gets logged:**

  | Event | Type | Details |
  |---|---|---|
  | Lend | `book_borrowed` | |
  | Return | `book_returned` | `meta.late` |
  | Extend | `borrow_extended` | `meta.from` / `meta.to` |
  | Book create / edit / delete | `book_added` / `book_updated` / `book_deleted` | edits log only the fields that really changed |
  | Cover upload / remove | `book_updated` | `meta.cover: 'uploaded' / 'removed'` |
  | Member add / edit | `member_added` / `member_updated` | changed fields |
  | Member activate / deactivate | `member_activated` / `member_deactivated` | separate events |
  | Member delete | `member_deleted` | |
  | Admin sets a password | `password_changed` | `meta.by: 'librarian'` |
  | Self-register | `member_registered` | |
  | Own password change | `password_changed` | `meta.by: 'self'` |
  | Own profile edit | `member_updated` | `meta.by: 'self'` |

- **Snapshots:** every row stores a readable snapshot in `meta` (`bookTitle`, `memberName`, `code`), so rows for deleted books or members still show a name.

## Phase 2: Realistic, deterministic seed (`server/seed.js`, rewritten)
- **No `Math.random`:** a seeded generator (**mulberry32**, fixed seed) makes every run produce the same data, relative to the day it runs.
- **Users:**
  - The 4 demo accounts are unchanged; there is 1 extra librarian and 26 extra members.
  - Members have Filipino names, `firstname.lastname@gmail.com` emails, PH mobile numbers and Metro Manila addresses.
  - They joined over the last 6 months, the newest in the last few days; 4 accounts are deactivated in total.
  - Member IDs come from the Counter in joining order.
- **About 300 transactions over 90 days:**
  - More on weekdays, fewer on Saturday and very few on Sunday, with a gentle upward trend.
  - Popular categories and about 20 "favourite" titles are borrowed more.
  - Borrowing times fall within library hours (8 AM–6 PM Manila); return dates are the end of day 14 (`addDaysEndOfDay`), and extensions move them by 7 days.
  - About 83% are returned, about 80% of those on time; the rest are still out (on time / due soon / 1–12 days late).
- **Rules respected at every point in time:** each new borrowing is checked against the loans out *at that moment*:
  - never more copies out than owned
  - at most 5 active loans per member
  - no member holding 2 copies of the same book
  - deactivated members hold nothing
- **Transaction codes:** `TX-YYYY-NNNNNN` in borrowing order. They are numbered in one batch and the Counter is then set to the last number, instead of 300 database round trips.
- **Books afterwards:** `availableCopies = total − active` and `timesBorrowed = number of transactions`.
- **Activity log:** `member_registered`, `book_borrowed`, `borrow_extended` and `book_returned` at plausible times.
- **Logins:** 2–5 login records per active account, plus their last-login fields.
- **Seed output** (in-memory test run):
```
Seed finished:
  Users:        31 (2 librarians, 29 members, 4 deactivated)
  Books:        1000 titles, 2933 copies
  Transactions: 300 over 90 days (0 skipped by the rules)
                returned_on_time: 184, returned_late: 65, overdue: 19, active: 27, due_soon: 5
  Activity log: 668 rows · Logins: 94 rows
```

## Phase 3: Admin dashboard (redesigned; the book catalog is no longer on it)
### Backend: `GET /api/dashboard?range=7|30|90`
- Access: protect + adminOnly. `range` is validated as an enum, with 30 as the default.
- About 18 queries run in parallel with `Promise.all`.
- **What it returns:**
  - **stats:** total titles and copies, borrowed now, late returns, returned today, active members, new members this week, and the borrowing trend in % against the previous period of the same length
  - **daily:** borrowed and returned per day, every day present, days without activity filled with 0, grouped by **Manila** day (`$dateToString` with `timezone`)
  - **statusDonut**
  - **categoryDonut:** top 5 + "Other"
  - **returningSoon:** 5 items
  - **lateFollowUps:** 5 items, most days late first, with contact details
  - **mostBorrowed:** top 5
  - **recentActivity:** the latest 10 log rows, populated

### Frontend
- **Header:** a 7 / 30 / 90 days switch (stored in the URL as `?range=`) and a **Lend book** button.
- **Row 1:** 5 stat cards:
  - Total books (copies below)
  - Borrowed now (▲/▼ trend)
  - Late returns (red when above 0)
  - Returned today
  - Active members (+N new this week)
- **Row 2:**
  - Left: a Recharts grouped bar chart "Borrowed vs returned" with rounded tops, tooltip and legend; fewer x-axis labels for 30 and 90 days; short animation, switched off for reduced motion.
  - Right: "Returning soon", at most 5 rows and never scrollable; each row opens the TransactionDetailsModal.
- **Row 3:**
  - Two donuts (status; category top 5 + Other), each with a legend of labels, numbers, % and Bootstrap progress bars.
  - "Late returns to follow up", where the contact number uses CopyableText.
- **Row 4:**
  - Left: "Recent activity", a table inside a 360 px box that scrolls internally with a sticky header. It shows relative time (the exact date and time in a tooltip), soft event badges, the member with their avatar, the book, and who did it.
  - Right: "Most borrowed", whose rows open the BookDetailsModal.
- **Every card** has a skeleton while loading and a friendly empty state. When the range changes, the old numbers stay visible, slightly dimmed.
- **Chart colours:**
  - `hooks/useThemeColors.js` reads the CSS variables and re-reads them when `data-theme` changes, so the charts follow the theme.
  - Each chart has a role="img" aria-label summary.
  - The donuts never rely on colour alone: the legend shows labels and numbers.
  - The status donut uses green / amber / red, so it stays readable in every theme.

## Phase 4: Settings (`/admin/settings`, replaces "Coming soon")
**Layout:** a left menu on tablet and desktop, tabs on phones, with the section stored in the URL (`?tab=`). Content is at most 720 px wide. The sections (`components/settings/*`) only use `/api/auth/*`, so the member side can reuse them.

### Profile
- **Photo:**
  - The image is center-cropped to a square and resized to 256×256 JPEG in the browser (`prepareAvatar` in the generalised `utils/imageResize.js`).
  - It uploads immediately; there is also a "Remove photo" button with a confirmation.
- **Storage:**
  - Photos live in the `UserAvatar` collection.
  - `User.avatarKey` is a new random 32-hex value from `crypto.randomBytes` on every upload and is removed on delete.
  - The public `GET /api/avatars/:key` route validates the key format, sends an ETag and a long cache header, and sets CORP cross-origin on that route only. Because keys are random, nobody can list other users' photos.
- **Where photos show:** `Avatar` displays the photo (falling back to initials) in the sidebar, the Members table, the user and transaction modals, the book borrowers list, the Lend modal, the dashboard cards and the activity table. `avatarKey` is included in `/me`, login, user lists, and the transaction, book and dashboard data.
- **Fields:**
  - Editable: name, contact number and address, with limits, FieldLimit counters, an unsaved-changes hint and the browser's leave prompt.
  - Read-only: email, member ID, role, member since.
  - `PUT /api/auth/profile` now accepts **only** name, contactNumber and address. Before, it accepted name and password; the password has its own route now.

### Appearance (8 themes)
- **Tokens:** `--nu-blue*` / `--nu-gold*` were renamed to **`--brand-primary` / `--brand-accent`** everywhere.
  - All shades are derived with `color-mix()`: hover/pressed = primary mixed with black, tints = primary mixed with white.
  - Each theme defines only 2 colours.
  - `[data-theme]` works on any element, so each preview card draws itself in its own theme.
  - Bootstrap pieces that used fixed rgb values (links, focus ring, progress bars) now use the variables.
- **Themes:** NU Classic (default), Cobalt, Royal Amethyst, Heritage Green, Crimson Scholar, Midnight Navy, Teal Harbor, Slate Minimal.
- **Contrast** (computed for every theme):

  | Pair | Lowest ratio | Rule |
  |---|---|---|
  | White on primary | 7.46 (Teal Harbor) | ≥ 4.5 needed, all pass |
  | Dark text on accent | 7.5 | all pass |
  | Accent on white | 1.4–2.24 | accent is never used as text on white |

  To keep that rule in every theme, text on the accent colour (sidebar "Librarian" tag, gold avatar, Librarian badge) now uses dark text instead of primary text. With primary text, Teal Harbor would only reach 4.3:1.
- **UI:**
  - A grid of preview cards (mini sidebar, button and badge), with the current theme marked.
  - Clicking a card previews it live across the app; Save stores it, Cancel reverts, and "Reset to NU Classic" previews the default.
  - Leaving the page without saving reverts to the saved theme.
- **Storage:** `User.preferences.theme` (an enum of 8 keys) via `PUT /api/auth/preferences`, returned by `/me` and login.
- **No flash on refresh:**
  - An inline script in `index.html` applies the last theme from localStorage before React loads; the server's value wins once `/me` returns.
  - Tested: with `/me` held back for 1.5 s, the saved theme was already showing.
- **Defaults:** logging out resets to NU Classic, and the login and register pages always use NU Classic.

### Security
- **Sign-in activity:** the last login (date · time, device, IP) and the last 5 logins of your account (new `GET /api/auth/logins`).
- **Change password:**
  - A smooth collapse with 3 fields, each with a show/hide eye.
  - A strength meter (Weak / Fair / Good / Strong) and a live "Passwords match" check.
  - Save stays disabled until everything is valid; Cancel collapses and clears.
- **`PUT /api/auth/password`:**
  - Has its own limiter of **10 per 15 min**.
  - A wrong current password → 400 "Current password is incorrect"; the new one must differ from the current one and be 6–72 characters.
  - Logged as `password_changed`.
- **Sign out other devices:**
  - `User.tokenVersion` is stored in the JWT as `tv`; `protect` rejects a token whose `tv` doesn't match (a missing `tv` counts as 0, so existing tokens keep working).
  - Changing your password increments the version and returns a **new token** for this session.
  - An admin setting a member's password also increments that member's version.
  - Toast: "Password changed. You've been signed out on other devices."

---

## API endpoints (new or changed)
| Method | Path | Access | Note |
|---|---|---|---|
| **GET** | **`/api/dashboard?range=7\|30\|90`** | protect + adminOnly | new |
| **GET** | **`/api/auth/logins`** | protect | new: last login + last 5 logins |
| **PUT** | **`/api/auth/preferences`** | protect | new: `{ theme }` (one of 8) |
| **PUT** | **`/api/auth/password`** | protect + its own limit (10 / 15 min) | new |
| **PUT** | **`/api/auth/avatar`** | protect | new: multipart field `avatar`, ≤150 KB, magic-byte check |
| **DELETE** | **`/api/auth/avatar`** | protect | new |
| **GET** | **`/api/avatars/:key`** | **public**, read-only | new: key must be 32 lowercase hex |
| PUT | `/api/auth/profile` | protect | **changed:** only name, contactNumber, address (no password) |
| POST | `/api/auth/login`, `/api/auth/register` | public | token now carries `tv`; the response includes `preferences` and `avatarKey` |
| GET | `/api/auth/me` | protect | adds `preferences`, `avatarKey`, contact, address, createdAt |
| PUT | `/api/users/:id/password` | admin | also signs that member out everywhere |
| GET | `/api/users`, `/api/users/:id`, transactions, books `:id` | admin / protect | include `avatarKey`; never `tokenVersion` |
| all actions | | | write activity log rows (Phase 1) |

## New npm packages
- **client:** `recharts` ^3.10.1
- **server:** none (multer is from round 3)

## Files
**Deleted:** `library-mern/README.md`

**Created (server):**
- `models/ActivityLog.js`
- `models/UserAvatar.js`
- `routes/dashboard.js`
- `routes/avatars.js`
- `utils/activity.js`
- `utils/themes.js`

**Created (client):**
- `hooks/useThemeColors.js`
- `utils/theme.js`
- `utils/activity.js`
- `components/dashboard/DashboardCard.jsx`
- `components/dashboard/BorrowChart.jsx`
- `components/dashboard/DonutCard.jsx`
- `components/dashboard/ListCards.jsx`
- `components/settings/ProfileSettings.jsx`
- `components/settings/AppearanceSettings.jsx`
- `components/settings/SecuritySettings.jsx`
- `pages/admin/SettingsPage.jsx`

**Edited (server):**
- `server.js`
- `seed.js` (rewritten)
- `middleware/auth.js`
- `models/User.js`
- `routes/auth.js` (rewritten)
- `routes/books.js`
- `routes/transactions.js`
- `routes/users.js`

**Edited (client):**
- `index.html`
- `package.json` / `package-lock.json`
- `App.jsx`
- `index.css`
- `styles/admin.css`
- `context/AuthContext.jsx`
- `utils/imageResize.js`
- `components/Avatar.jsx`
- `components/AuthLayout.jsx`
- `components/books/BorrowerList.jsx`
- `components/members/UserDetailsModal.jsx`
- `components/transactions/LendModal.jsx`
- `components/transactions/TransactionDetailsModal.jsx`
- `layouts/AdminLayout.jsx`
- `pages/admin/AdminDashboard.jsx` (rewritten)
- `pages/admin/MembersPage.jsx`
- `pages/admin/TransactionsPage.jsx`

---

## Test results
**Build:**
- `npm run build` (client) passes with no warnings.
- `node --check` passes on every server file.
- No hex colours outside `index.css`, no old `--nu-*` tokens, and no "due / overdue / loan" in the new screens.

**Round 4 API and seed tests: 90 / 90 passed.**
- **Seed, run twice into two databases:**
  - Every rule was replayed at all 300 borrowing moments: copies never above total, at most 5 active per member, no duplicate active book, and nothing out for deactivated members.
  - Book counters are consistent, codes are unique and in order, every borrowing is in library hours, every return date is end of day, and member IDs follow joining order.
  - **Identical checksum for both runs** (deterministic).
- **Dashboard:**
  - Bad ranges (`x`, `14`, `0`, injection-style) → 400; a member → 403; the default is 30.
  - Every day is present and the last one is today in Manila; the daily sums match the database.
  - A borrowing at 00:30 Manila (16:30 UTC the day before) is counted on the Manila day.
  - The donut adds up to "borrowed now"; the lists have at most 5 items in the right order; there are 10 recent-activity rows, newest first.
- **Activity log:** each of the 13 event types is written exactly once per action. The snapshots for a deleted book and a deleted member are kept, and extensions store `{ from, to }`.
- **Photos:**
  - Upload → 32-hex key; the public GET returns the bytes, sets CORP cross-origin, a long cache and an ETag, and answers 304.
  - Bad key → 400; uppercase key → 400; unknown key → 404.
  - Too big → **413**; wrong type → 400; fake image (magic bytes) → 400; no token → 401.
  - A new upload creates a new key and the old one stops working; delete removes the photo.
  - Lists include `avatarKey` and never `tokenVersion`.
- **Preferences and profile:**
  - Unknown or missing theme → 400; saving works and `/me` returns it.
  - Profile: email, role and memberId are ignored; a bad phone or an 81-character name → 400.
- **Password:**
  - Wrong current password → 400 with the exact message; same as current → 400; too short or long → 400.
  - Success returns a new token. The other device's old token and this session's old token both → 401; the new token works; logging in with the new password works.
  - An admin setting a member's password signs that member out.
  - A token without `tv` still works (it counts as version 0).
  - **The rate limit kicks in** after 10 attempts (429).

**Regression suites:**
- Round 3 API tests: **66 / 66 passed** (on the new seed).
- Round 1 tests: 99 / 114. All 15 failures are checks written for the **old 4-user, 8-transaction seed** (for example "exactly 1 librarian", "member ID 0005", "exactly 2 unreturned"). None is an app regression.

**Browser** (headless Edge):
- **Dashboard at 375, 768, 1366×768 and 1920×1080:**
  - no horizontal scroll
  - stat cards go 1 / 2 / 3 / 5 per row
  - the chart resizes (301 → 1022 px wide)
  - "Returning soon" and "Late returns" show exactly 5 rows and never scroll
  - "Recent activity" scrolls inside its 358 px box
- **All 8 themes:** screenshots of the Dashboard, Books, Members, Transactions, Settings, and a modal with a toast. The bar colour changed for every theme (8 different values).
- **Theme flow:** live preview without saving, Cancel reverts, Save persists (toast + localStorage), no flash on reload, and after logout the login page uses NU Classic.
- **Photo:** an 800×1000 PNG became a 256×256 photo and appeared in the sidebar.
- **Password form:** strength Weak → Strong, the match check, Save disabled until valid, the eye toggle, the success toast, and still logged in afterwards.

---

## Bugs found and fixed by the tests
- **Gmail addresses with dots could not log in.** `normalizeEmail()` removes dots from Gmail addresses by default, so `andrea.reyes@gmail.com` was looked up as `andreareyes@gmail.com`. All email normalisation now keeps the dots (`gmail_remove_dots: false` in register, login and member create/edit).
  - **Possible effect on existing data:** any account registered *through the app* with a dotted Gmail address was stored without the dots. Re-seeding fixes the demo data.
- **The 100-requests login limiter covered all of `/api/auth`.** That path now includes `/me`, profile, photo and theme routes, so normal use could lock someone out of logging in. The limiter now applies only to **login and register**; the password change has its own stricter limit.

## Not finished / different from the instructions
- **Determinism:** the seed is identical for the same day; every run is placed relative to "today", so the dates shift by one day if you run it tomorrow.
- **Transaction codes in the seed** are numbered in one batch and the Counter is then set to the last number, instead of one Counter call per transaction. The result is the same and it is much faster against Atlas.
- **"Returning soon"** lists currently-borrowed items whose return date is still ahead (late ones are in "Late returns to follow up"), to avoid showing the same items twice.
- **Status donut colours:** "On time" uses the green success colour instead of the theme primary, because in Crimson Scholar the primary and the "Late" red looked alike. The bar chart and category donut follow the theme.
- **`PUT /api/auth/profile`** no longer changes the password; use `PUT /api/auth/password`.
- **Unsaved-changes prompt:** it still does not catch the sidebar links inside the app (`<BrowserRouter>`, see round 3).
- **Later:** a member dashboard/portal, reservations, late fines, export (CSV/XLSX/PDF), bulk upload, and a new README.
