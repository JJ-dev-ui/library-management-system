# Round 7 report: member portal + borrow requests

Branch `rebuild`, **not committed**. `.env` was not touched; seed/reset/backfill were **not** run.
As agreed, the app was not started and no test scripts were run. The only checks were `npm run build` and `node --check`. Everything that needs the running app is in **Please test manually**.

## Manual steps for you
1. No new packages (no `npm install` needed).
2. **`cd server && npm run seed` is required.** It creates the new collections (requests, bookmarks, notifications), book dates and `feedRank`. It wipes the database.
3. Restart the API so Mongoose creates the new indexes (one pending request per member + book, bookmark uniqueness, notification dedupe and TTL).

## Changes per phase
**Phase 1 — Models + seed**
- **New models:**
  - `BorrowRequest`: code `RQ-YYYY-NNNNNN`, 5 statuses, a note of up to 300 characters, `expiresAt` = the end of the 3rd day, `decidedAt/By`, and a `transaction` link. Indexes `{user,status}` and `{status,requestedAt}`, plus a partial unique index on `{user,book}` while pending.
  - `Bookmark`: unique per user + book.
  - `Notification`: 7 types, a unique `{user,dedupeKey}` index, `{user,createdAt}`, and a 90-day TTL.
- **Changed models:**
  - `Book.feedRank`: random; the default covers create and import too.
  - ActivityLog: `request_created`, `request_cancelled`, `request_approved`, `request_denied`, `request_expired`.
  - `nextRequestCode()` in `utils/counter.js`.
- **Seed (`seed.js`, still deterministic):**
  - **Book dates:** about 8 books added in the last 7 days, about 17 more in the last 30, and the rest over 6 months. No transaction starts before its book was added. Every book gets a `feedRank`.
  - **`member@gmail.com`:** no late books (past-due ones are returned), 2–3 borrowed (one due soon), 1 pending request, 1 denied with a note, 1 expired request, 2 approved requests linked to their transactions, 8 bookmarks, and notifications.
  - **`juan@gmail.com`:** gets a late book if the simulation did not give him one.
  - **Requests:** about 12 approved (each linked to the real transaction, with matching dates), about 6 pending (only for members without late books, within the 5-book limit, for available books), about 5 denied (mostly with notes), about 4 cancelled and about 3 expired. Each has its activity-log rows.
  - **Notifications:** created with the same helper the API uses, so the texts and dedupe keys match. Return reminders and the weekly digest are added for all active members.
  - **Bookmarks:** 0–12 for each of the other active members.
  - **Summary:** the seed now prints the request, bookmark and notification counts, the new books, and the demo/Juan state.

**Phase 2 — Request workflow API**
- **One rules helper** (`utils/requestRules.js` → `checkRequestRules`) is used when a request is created, at approval, and for the member's button state. It checks: active member, role member, book exists and is not archived, no late books, not already borrowing it, no pending request for it, borrowed + pending < 5, and a copy available. Each failure has a reason code and a human message.
- **Lazy expiry:** `expirePendingRequests` runs before requests are read. Each request is expired with a conditional update, so the log and notification happen exactly once.
- **Same lend code:** `utils/lend.js` → `createLoan` is used by both "Lend to member" and Approve (atomic copy decrement, 14 days ending at end of day, TX code, rollback).
- **Approve** first claims the request atomically, so two librarians can't both approve it. If the loan fails, the request goes back to pending.
- **Lend to member** now also counts pending requests toward the 5-book limit.
- Deleting a member is also refused when they have requests; their bookmarks and notifications are deleted with the account.

**Phase 3 — Admin Requests page**
- The `/admin/requests` page has:
  - stat cards and tabs with counts (Pending is the default);
  - search, and sort (oldest pending first by default);
  - a table with code, member, book, copies available now, requested, expires and status.
- **Approve** has the requested confirmation. It is disabled with the reason tooltip when it isn't possible right now (the server sends `approval` for each pending row).
- **Deny** opens a modal with an optional note (with a FieldLimit counter).
- `RequestDetailsModal` shows the member, book, timeline, note, and a link to the transaction it created.
- Sidebar "Requests" item (before Transactions) with an accent-colour pending badge, refreshed every 60 s and after actions.
- The dashboard shows an "N pending requests" pill.

**Phase 4 — Member layout**
- **Top bar (`MemberLayout`):**
  - "Stacks." logo + a rounded, debounced search (results show on Home as `/?q=`).
  - Home, Bookmarks, My Books and Profile with a primary underline on the active tab; My Books shows a late / due-soon badge.
  - The bell, and the avatar menu (Profile, Log out with ConfirmModal).
- **Phones:** a search icon that opens a full-width search, the bell, and a bottom tab bar (safe-area aware).
- **Three columns** (`MemberColumns`):
  - ≥1200 px: New arrivals | feed | Most borrowed.
  - 992–1199 px: New arrivals moves into the right column.
  - <992 px: a single column; Home shows the highlights as horizontal strips.
- **Highlights endpoint:** `GET /api/member/highlights` (validated, archived books excluded, member-safe fields, 60 s server cache).

**Phase 5 — Feed, modal, bookmarks**
- **Feed:** `GET /api/feed`. Without a search it is ordered by `(feedRank + seed) mod 1,000,003` (no `$sample` or `$where`); with a search, an escaped regex on title, subtitle, authors and ISBN, ordered by title. Each book includes `bookmarked`.
- **Home:**
  - All / Available-now toggle and a category dropdown.
  - Facebook-style `BookPostCard`.
  - Infinite scroll (IntersectionObserver), skeleton posts, "You're all caught up", and Back to top.
  - A new seed on load, and when Home is clicked while on Home.
- **`MemberBookModal`:**
  - Bookmark toggle next to X, zoomable cover, every detail, "Find it on shelf …", copyable ISBN, "Show more".
  - The footer comes from `/api/me/book-status`: borrowing / requested + Cancel request / Request disabled with the reason / Request with the confirmation, and the success toast.
- **Bookmarks:** infinite scroll; removing a bookmark fades the card out and offers Undo in the toast (the toast now supports an action button).

**Phase 6 — My Books:** a segmented control with `?tab=`.
- **Borrowed:** status badge, borrowed date and time, return date + "Return in 3 days" / "4 days late", and the late alert.
- **Requests:** status, note, expiry, Cancel with a confirmation, and a link for approved requests. Load more.
- **History:** a summary (this year, favourite category, on-time rate) and Load more.

**Phase 7 — Profile:** a header card (theme band, avatar, member ID, member since, counts) plus the same `ProfileSettings`, `AppearanceSettings` and `SecuritySettings` as the librarians' page. They only call `/api/auth/*` (protect), which members may use. Phones also get a Log out button.

**Phase 8 — Notifications:**
- **Events:** request approved, denied, expired and cancelled (cancel is created already read, since it is the member's own action).
- **Lazy reminders:** return soon (within 2 days) and late, once per transaction, plus a weekly "N new books" digest per ISO week.
- **UI:** the bell dropdown (360 px; a full-screen sheet on phones) with Mark all as read and "See all", and the `/notifications` page with Load more.
- **Polling:** the unread count is polled every 60 s and on window focus.

**Phase 9:** README, REBUILD_SUMMARY.md, this report.

## Endpoints (new or changed)
| Method | Path | Access |
|---|---|---|
| POST | `/api/requests` | protect + memberOnly, 20 / hour per member |
| PUT | `/api/requests/:id/cancel` | protect + memberOnly (own, pending) |
| GET | `/api/requests`, `/api/requests/stats`, `/api/requests/:id` | protect + adminOnly |
| PUT | `/api/requests/:id/approve`, `/api/requests/:id/deny` | protect + adminOnly |
| GET | `/api/me/summary`, `/api/me/book-status/:bookId`, `/api/me/borrowed`, `/api/me/requests`, `/api/me/history` | protect + memberOnly |
| GET / POST / DELETE | `/api/me/bookmarks`, `/api/me/bookmarks/:bookId` | protect + memberOnly |
| GET / PUT | `/api/me/notifications`, `…/unread-count`, `…/:id/read`, `…/read-all` | protect + memberOnly |
| GET | `/api/feed`, `/api/member/highlights` | protect |
| GET | `/api/books/:id` | protect (members: member-safe fields, 404 if archived) |
| GET | `/api/dashboard` | admin (+ `pendingRequests`) |
| POST | `/api/transactions` | admin (limit now counts pending requests) |
| DELETE | `/api/users/:id` | admin (also refused when the member has requests) |

## Files
**Created, server:**
- Models: `models/BorrowRequest.js`, `models/Bookmark.js`, `models/Notification.js`
- Routes: `routes/requests.js`, `routes/me.js`, `routes/feed.js`
- Utils: `utils/policy.js`, `utils/lend.js`, `utils/requestRules.js`, `utils/notifications.js`, `utils/memberBook.js`

**Created, client:**
- Layout and context: `layouts/MemberLayout.jsx`, `context/MemberContext.jsx`
- Hooks, utils and styles: `hooks/usePagedList.js`, `utils/highlights.js`, `styles/member.css`
- Member components (`components/member/`): `BookPostCard.jsx`, `MemberBookModal.jsx`, `Highlights.jsx`, `NotificationBell.jsx`, `NotificationItem.jsx`, `BackToTop.jsx`
- Request components (`components/requests/`): `RequestDetailsModal.jsx`, `DenyRequestModal.jsx`
- Member pages (`pages/member/`): `MemberHome.jsx`, `BookmarksPage.jsx`, `MyBooksPage.jsx`, `ProfilePage.jsx`, `NotificationsPage.jsx`
- Admin page: `pages/admin/RequestsPage.jsx`

**Edited, server:**
- `server.js`, `seed.js`, `scripts/backfill.js` (adds missing `feedRank`)
- Models: `models/Book.js`, `models/ActivityLog.js`
- Middleware and utils: `middleware/auth.js` (`memberOnly`), `utils/counter.js`
- Routes: `routes/books.js`, `routes/transactions.js`, `routes/users.js`, `routes/dashboard.js`

**Edited, client:**
- `App.jsx`, `main.jsx`, `layouts/AdminLayout.jsx`, `pages/admin/AdminDashboard.jsx`
- `context/ToastContext.jsx`, `utils/labels.js`, `utils/format.js`, `utils/activity.js`, `styles/admin.css`

**Deleted:** `client/src/pages/Home.jsx` (the placeholder).

**Docs:** `README.md`, `../REBUILD_SUMMARY.md`, this report.

## Checks
- `npm run build` (client): passes.
- `node --check` on every new or changed server file: passes.
- New packages: none.
- Not run: the app, the seed, and API/UI tests.

## Notes
- Expiry and reminders are lazy (no background job), so they happen on the next read. `TZ=Asia/Manila` is still needed on the server for end-of-day dates.
- Two simultaneous requests from the same member could pass the 5-book check together; the approval re-checks the limit, so it can never be passed when the book is handed over.
- Members' history may list a book that was archived later (it is their own record); the catalog, feed, modal and bookmarks never show archived books.

## Please test manually
1. **Feed:** run `npm run seed`, then log in as `member@gmail.com` → Home loads 10 posts and scrolling loads more (skeletons, then "You're all caught up" at the end). Click Home again → it scrolls up and the order changes.
2. **Search:** type "rizal" in the top search → the results are ordered by title; clearing the search shows the shuffled feed again. Filters: Available now; a category.
3. **Book modal:** open a post → Bookmark toggles (the card follows); "Find it on shelf …" is shown.
4. **Request:** press Request → confirm → toast "Request sent…". The modal shows "Requested · pick up within 3 days" with Cancel request. My Books → Requests lists it as Pending.
5. **Admin side:** log in as admin → the sidebar "Requests" badge counts it, and the dashboard shows "N pending requests". Requests → Pending lists it with copies available.
6. **Approve:** confirmation "Hand '…' to Demo Member now? The return date will be …" → the member gets a notification (bell badge within 60 s or on focus), and the book appears under My Books → Borrowed with its return date. Transactions shows the new transaction.
7. **Deny with a note:** the member sees the note under Requests and in the notification.
8. **Late books:** log in as `juan@gmail.com` → Request is disabled with "You have 1 late book. Return it before requesting more." My Books → Borrowed shows the late alert. In admin, Approve on any pending request of Juan's is disabled with the reason.
9. **5-book limit:** with borrowed + pending = 5, Request is disabled with "You've reached the 5-book limit (3 borrowed, 2 requested)."
10. **Cancel:** cancel a pending request (modal or My Books) → status Cancelled; "slots left" goes back up.
11. **Expiry:** in the database, set a pending request's `expiresAt` to yesterday → open My Books → Requests → it shows Expired, with a notification and an activity row (only once).
12. **Bookmarks:** remove one → the card fades out; Undo brings it back.
13. **Notifications:** the bell opens the panel; clicking one marks it read and opens the right tab; "Mark all as read" clears the badge; "See all" opens `/notifications`.
14. **Profile:** the header card shows the counts. Change the photo, theme and password; the last logins are listed.
15. **Phones (375 px):** the bottom tab bar appears, the search icon expands to a full-width search, the bell panel opens full screen, and toasts sit above the tab bar.
16. **Wrong role:** an admin opening `/` is sent to `/admin`; a member opening `/admin` is sent to `/`. As a member, calling `GET /api/requests` returns 403.
