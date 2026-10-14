# Round 8 report: flat visual overhaul, member layout, feed/grid, filters, notifications

Branch `rebuild`, **not committed**. `.env` was not touched; seed/reset/backfill were **not** run.
As agreed, the app was not started and no test scripts were run. The only checks were `npm run build` and `node --check`.

## Manual steps
- No new packages.
- No seed needed: `User.notificationsSeenAt` defaults to empty (the first badge counts every notification), and the new notification types are created on demand.
- Restart the API.

## Changes per phase
**1 — Visual overhaul** (mostly tokens + shared CSS, so every admin and member page changes):
- **Surfaces:**
  - The page is light grey (`#F4F5F7`); panels, stat cards, toolbars, utility cards and post cards are white with no border.
  - `--color-border` is now a near-invisible hairline, used only where two white areas touch (table rows, card footer, modal header/footer).
  - Shadows only on overlays (modals, dropdowns, toasts, search suggestions, the notification panel).
- **Spacing and shape:** 4px scale; 24px page gutters (16px on phones); 20px card padding; radius 10px on cards, 8px on controls, pill for chips/segmented/badges.
- **Type:**
  - Scale tokens `--fs-xs…xl` = 12/13/14/16/20/24; 14px body.
  - Page titles 24px / 600 / −0.01em.
  - One muted token (`#62667A`: 5.7:1 on white, 4.9:1 on the input fill).
  - `tabular-nums` for stats, tables, counters and badges.
  - Every ALL-CAPS label removed (table headers, detail labels, section labels, timeline labels, the sidebar tag).
- **Colour:** brand only for primary buttons, active nav/tabs, links, focus and selected states. Hover tints, date labels and empty-state icons became neutral.
- **Stat cards:** no icon squares; label 13px, number 24px/600, hint 12px. Danger = a red number + a soft red hint (no red border).
- **Badges:** pill, 12px/500, soft tint, no dot and no border (the `dot` class was removed from StatusBadge and MemberBadges).
- **Controls:**
  - Inputs and selects are filled; the border + ring show only on hover/focus (white while focused).
  - Secondary buttons are a soft fill; destructive secondary buttons are a soft red fill.
  - Segmented controls are a neutral pill track with a white selected pill.
  - Heights are 36px (32px small).
- **Tables:** no outer or vertical lines, hairline rows, 12px rows padding, sticky subtle header (12px muted, sentence case), neutral hover.
- **Copy:** Login "Log in with your library account." (the dashboard already shows "Dashboard" + the date). No emoji.
- **Sidebar:** no divider lines, smaller items, a quiet "Librarian" tag, a slightly lighter active background + a 3px accent bar.

**2 — Member layout:**
- **Columns:** `minmax(300px,340px) minmax(0,680px) minmax(300px,340px)` in a centered container (max 1440px). Every column has `min-width: 0` and the sticky columns use `overflow-x: hidden`. This fixes the clipped New arrivals and the horizontal scrollbar.
- **New arrivals:** the toggle sits on the title line; rows show the cover, title (2 lines), authors (1 line, ellipsis) and "Added …".
- **New Profile card** (top of the right column): avatar, name, email (ellipsis), and Completed / Borrowed now / To return (red when anything is late), plus "View my books". `/me/summary` adds `completedCount`.
- **Responsive:**
  - ≥1200px: 3 columns.
  - 992–1199px: the left column is hidden and New arrivals becomes a strip.
  - <992px: Home shows profile numbers + New arrivals + Most borrowed as compact strips.

**3 — Cards, grid, filters, search:**
- **Post card:**
  - The bookmark icon toggle (tooltip "Save for later" / "Remove bookmark") is in the top-right of the header.
  - Footer: "Shelf PRG-B4 · 4 available" on the left, and on the right either Request, a "Requested" or "Borrowing · return by Oct 27" badge, or a disabled Request with the reason tooltip.
  - Requests from any card or tile use one shared confirmation in `MemberLayout`.
- **Server:**
  - `/api/feed` and `/api/me/bookmarks` return `myStatus` (+ `myDueDate`) per book, computed in 3 queries per page.
  - They also return `requestBlock` once per response.
  - The client derives the same block reason from the live summary, so it updates right after a request.
- **Feed / Grid toggle** (localStorage `stacks.memberView`) on Home, Bookmarks and My Books.
  - Grid tiles: 2:3 cover, bookmark overlay, title (2 lines), authors (1 line), availability dot, status badge, and "Request" on hover (always visible on touch screens).
  - 5 per row ≥1400px, 4 ≥1200, 3 ≥768, 2 on phones.
  - In grid view the center also takes the left column's space, and New arrivals is a strip.
- **Filters** (Home + Bookmarks, synced to the URL):
  - The row: All / Available now, Category, Filters (with a count), Sort, view toggle; then category chips and active chips + Clear all.
  - The offcanvas: Author (autocomplete), Published eras (Before 1950 / 1950–1999 / 2000–2015 / 2016+) + custom years, Language, Length, Added this week/month, "Hide books I've borrowed before".
  - Sorts: Recommended (shuffle), Recently added, Title A–Z, Newest published, Oldest published, Most popular.
  - The server validates every parameter with whitelists and builds the filter with the admin `buildBookFilter`. Archived books are always excluded; "hide borrowed" reads only the member's own transactions.
- **Search:**
  - "/" focuses it (not while typing in a field; on phones it opens the full-width search).
  - Suggestions (`GET /api/feed/suggest`, debounced): up to 5 titles + 3 authors, with ↑/↓/Enter/Escape. A title opens its modal, an author applies the Author filter, and Enter (or "See all results") shows the full results on Home.
  - Typing alone no longer changes the feed.

**4 — Profile:** the banner is gone; the page has a compact header row (avatar, name, member ID, member since), underline tabs (Profile / Appearance / Security, forms ≤ 720px), and the same side columns.

**5 — Notifications:**
- **Seen vs read:** `User.notificationsSeenAt`. The badge counts notifications created after it. Opening the bell resets the badge at once and saves the time with `PUT /api/me/notifications/seen` (after the list loads, so the groups use the previous time). Items stay highlighted until clicked or "Mark all as read". The panel and the page group items into "New" and "Earlier".
- **New types:**
  - `new_books_today`: "5 new books were added today", once per Manila day, only if any; opens Home sorted by Recently added.
  - `top_book_month`: "Last month's most borrowed book: '…'", once per month; opens the book.
  - `bookmark_available`: created in the return handler when a return takes a book from 0 to 1 available copy, for every member who bookmarked it (except the one returning it). Once per book per day.
  - The weekly digest now links to Home with "Added this week" + Recently added.

## Endpoints (new or changed)
| Method | Path | Access |
|---|---|---|
| GET | `/api/feed` — new params `author, language, yearFrom, yearTo, length, added, hideBorrowed, sort`; returns `myStatus`, `myDueDate`, `requestBlock` | protect |
| GET | `/api/feed/suggest?q=` (min 2 chars, escaped regex, member-safe) | protect |
| GET | `/api/me/bookmarks` — same filters/sort; returns `myStatus`, `requestBlock` | member |
| GET | `/api/me/summary` — adds `completedCount`, `unseenNotifications` | member |
| GET | `/api/me/notifications` — adds `unseen`, `seenAt`; `…/unread-count` returns `{ unread, unseen }` | member |
| PUT | `/api/me/notifications/seen` | member (own user only) |
| PUT | `/api/transactions/:id/return` — notifies bookmarkers on 0 → 1 copy | admin |

## Files
**Created:**
- Server: `server/queries/memberBooks.js`
- Client components: `client/src/components/member/BookTile.jsx`, `client/src/components/member/MemberFilters.jsx`, `client/src/components/member/SearchBox.jsx`
- Docs: this report

**Edited, server:**
- Models: `models/User.js`, `models/Notification.js`
- Routes: `routes/feed.js`, `routes/me.js`, `routes/transactions.js`
- Utils: `utils/notifications.js`, `utils/requestRules.js`, `utils/memberBook.js`

**Edited, client:**
- Styles: `index.css`, `styles/admin.css`, `styles/member.css` (rewritten)
- Context and layout: `context/MemberContext.jsx` (rewritten), `layouts/MemberLayout.jsx`
- Shared components: `components/admin/StatCard.jsx`, `components/skeletons/StatCardSkeleton.jsx`, `components/transactions/StatusBadge.jsx`, `components/members/MemberBadges.jsx`
- Member components: `components/member/BookPostCard.jsx`, `Highlights.jsx`, `MemberBookModal.jsx`, `NotificationBell.jsx`, `NotificationItem.jsx`
- Member pages: `pages/member/MemberHome.jsx`, `BookmarksPage.jsx`, `MyBooksPage.jsx`, `ProfilePage.jsx`, `NotificationsPage.jsx`
- Other: `pages/Login.jsx`, `utils/format.js`

**Docs:** `../REBUILD_SUMMARY.md`.
**Deleted:** none.

## Checks
- `npm run build` (client): passes.
- `node --check` on every changed server file: passes.

## Please test manually
1. **No horizontal scroll:** on Home at 1366×768 and 1920×1080 there is no horizontal scrollbar, and New arrivals is fully visible, with ellipsis on long titles/authors and the 7/30 toggle on the title line.
2. **Profile card:** the right column shows avatar, name, email, and Completed / Borrowed now / To return (red when late).
3. **Post card:** the bookmark icon is in the top-right (it toggles, with a tooltip). The footer shows "Shelf … · N available" + Request. For a requested book it says "Requested"; for a borrowed book, "Borrowing · return by …". As `juan@gmail.com`, Request is disabled with the late-book tooltip.
4. **Feed ↔ Grid:** switching to Grid survives a refresh (also on Bookmarks and My Books). Grid shows 5/4/3/2 tiles per row by width, and Request appears on hover.
5. **Filters:** Filters → "Before 1950" + Sort "Oldest published" → old books first. "Hide books I've borrowed before" removes books from the member's history. Chips + Clear all work, and the URL keeps every filter after a refresh.
6. **Search:** press "/" → the search is focused. Type "har" → title and author suggestions appear. ↓ + Enter on a title opens its modal; on an author, the Author filter is applied. Enter alone shows the results.
7. **Bell:** with unseen notifications, the badge shows a number. Opening the bell resets it to 0, items stay highlighted until clicked, and the list is grouped New / Earlier.
8. **Available again:** as `member@gmail.com`, bookmark a book with "All copies borrowed". As admin, return one of its copies → the member gets "'…' is available again — request it before it's gone." (once that day).
9. **New today / top book:** on the first visit of a day with new books, there is a "New today" notification; on the first visit of a month, "Last month's most borrowed book".
10. **Admin look:** Dashboard, Books, Members, Transactions and Requests are flatter: no card borders, no coloured icon squares on stat cards, sentence-case pill badges without dots, filled inputs, soft secondary buttons, and quiet table headers. Check all 8 themes in Settings → Appearance.
11. **Profile page:** a compact header (no banner), Profile / Appearance / Security underline tabs, and the side columns visible on desktop.

## Follow-up (after the first review, client only)
No server changes, no seed. Checks: `npm run build` passes.

**Changes:**
- **New arrivals carousel:** in strip mode, ‹ › buttons slide the row smoothly (`scrollBy` with `behavior: smooth`). The scrollbar is hidden, the edges fade out, and the chips glide in.
- **Feed ↔ Grid animation:** the left column slides shut while the center grows (animated with `@property --left-w / --center-max`). The New arrivals strip folds open (`grid-template-rows 0fr → 1fr`), and posts/tiles fade up. The left column stays mounted (`inert` while hidden), so it does not reload. `overflow-x: clip` keeps the sticky columns working.
- **Softer text:** `--color-text` is `#262938`, and the new `--color-text-soft` (`#474B5C`) is used for buttons, chips and side cards.
- **Less cramped filters:** the category dropdown was removed (the category chips do the same job), and the row is grouped with more space between groups.
- **Theme touches:**
  - Book titles use the theme colour (`--brand-title`, 88% theme colour + black).
  - A light theme line under posts, tiles and New arrivals chips (`--brand-line`, stronger on hover).
  - Theme-tinted hovers (`--hover-tint`, brand-50) on cards, table rows, chips, tabs and secondary buttons.
- **Profile tabs:** the Profile / Appearance / Security tabs and their content are now one card (`.tab-card`): the tabs are its header and the chosen section is its body.

**Files edited:** `client/src/index.css`, `styles/admin.css`, `styles/member.css`, `components/member/Highlights.jsx`, `components/member/MemberFilters.jsx`, `pages/member/ProfilePage.jsx`, `../REBUILD_SUMMARY.md`.

**Please test manually:**
1. In the 992–1199px width (or grid view), the ‹ › buttons slide New arrivals with no scrollbar.
2. Switch Feed ↔ Grid on Home: the left column slides away smoothly and the strip folds open.
3. Book titles and the line under each card follow the theme in all 8 themes.
4. Profile: the tabs and the form below them read as one card.

Note: Round 9 replaced the theme-tinted card hover with a shadow lift and made the line fainter (see `ROUND9_REPORT.md`).
