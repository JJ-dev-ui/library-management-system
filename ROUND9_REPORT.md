# Round 9 report: smoother member portal, smaller corners, presentation accounts

Branch `rebuild`, **not committed**. `.env` was not touched.
**`npm run seed` WAS run this round** (you asked for it, to create the presentation accounts in Atlas). The seed **wipes the whole database** and rebuilds it, so all earlier test data (for example testUSER and manual lends) is gone.
The app was not started and no test scripts were run. The only checks were `npm run build`, `node --check` and the seed itself.

## Presentation accounts (password for all: `member123`)
| Email | Name | State after seeding |
|---|---|---|
| user1@gmail.com | Lara Villareal | **Clean:** joined 3 days ago; no transactions, requests, bookmarks, notifications or logins |
| user2@gmail.com | Ramon Delos Reyes | 14 transactions, all returned |
| user3@gmail.com | Isabel Cruz | 6 transactions, 1 borrowed now |
| user4@gmail.com | Daniel Ong | 13 transactions, 1 borrowed now |
| user5@gmail.com | Hannah Javier | 12 transactions, 3 borrowed now, **2 late** |

Other accounts: `admin@gmail.com` / `admin123`, `member@gmail.com` / `member123`.
**Side effect:** adding 5 users changed the random data, so `juan@gmail.com` no longer has a late book. Use **user5** to demo late books and the request block.

Seed totals: 36 users (2 librarians, 34 members, 4 deactivated), 1000 titles / 2933 copies, 301 transactions over 90 days, 30 requests, 221 bookmarks, 96 notifications.

## Changes
**1. Cards no longer blend into the background (NU blue):** the theme-tinted hover is gone, because in NU blue it matched the page background. Cards now stay white and lift with a soft two-layer shadow (`--shadow-hover`) on hover, which works the same in every theme. Applies to post cards, grid tiles, New arrivals chips and the admin book cards.

**2. Fainter theme line, smaller corners:**
- The line under posts/tiles/chips is 2px and much fainter (`--brand-line`: 9% theme colour). It gets stronger (28%) only on hover.
- **Radius:**
  - 6px on cards and controls; 4px for small parts (`--radius-sm`).
  - Chips, badges, segmented controls and the search use `--radius-pill` (now 6px).
  - Only number badges (nav/count badges, `.btn-count`) stay circular (new `--radius-round`).

**3. No stutter when switching tabs:**
- **Cause:** each page (Home, Bookmarks, My Books, Profile, Notifications) rendered its own side columns, so a tab switch rebuilt the whole page. While the page was briefly short, the scrollbar disappeared and came back.
- **Fix:**
  - The side columns (`MemberColumns`) moved into `MemberLayout` and stay mounted; only the center content (`<Outlet>`) changes.
  - Each page tells the layout how to look with the new `useMemberPage({ wide, home })` hook in `MemberContext`.
  - `html { scrollbar-gutter: stable }` always reserves the scrollbar's space.
  - The center column has a minimum height.
  - The window scrolls to the top before the new page is drawn (`useLayoutEffect` on the path).

**4. Back-to-top button:** it is always rendered and fades + slides in and out (260ms) instead of popping up. The scroll listener is throttled with `requestAnimationFrame`. While hidden it cannot be focused (`tabIndex -1`, `aria-hidden`).

**5. Presentation accounts (`server/seed.js`):**
- Added `PRESENTATION_MEMBERS` (user1–user5).
- user1 is marked `clean` and is skipped by the borrowing simulation, the login history, requests, bookmarks and notifications.
- user2–5 take part like any other member.
- The seed's final output now lists the presentation accounts with their transaction / borrowed / late counts.

## Files
**Edited, client:**
- Styles: `client/src/index.css`, `styles/admin.css`, `styles/member.css`
- Context and layout: `context/MemberContext.jsx` (`pageLayout` + `useMemberPage`), `layouts/MemberLayout.jsx`
- Components: `components/member/BackToTop.jsx` (rewritten)
- Pages: `pages/member/MemberHome.jsx`, `BookmarksPage.jsx`, `MyBooksPage.jsx`, `ProfilePage.jsx`, `NotificationsPage.jsx` (they no longer wrap themselves in `MemberColumns`)

**Edited, server:** `server/seed.js`.
**Docs:** this report, the follow-up section in `ROUND8_REPORT.md`, `../REBUILD_SUMMARY.md`.
**Created:** this report. **Deleted:** none.

## Checks
- `npm run build` (client): passes.
- `node --check seed.js`: passes.
- `npm run seed`: finished without errors (output above).

## Please test manually
1. **NU blue:** hover cards on Home (Feed and Grid), Bookmarks and My Books. Each card stays white and lifts with a shadow, and the line under it is subtle. Repeat in one other theme.
2. **Corners:** cards, buttons, inputs, chips and badges have small (6px/4px) corners; number badges are still round. Check one admin page too.
3. **Tab switching:** go Home → Bookmarks → My Books → Profile → Notifications. The side columns stay put, the scrollbar does not flicker, and each page starts at the top.
4. **Back to top:** scroll down → the button fades in; click it or scroll up → it fades out.
5. **Accounts:**
   - Log in as user1: no notifications, empty My Books and Bookmarks, and Completed / Borrowed now / To return all 0.
   - Log in as user5: late books are shown, and Request is disabled with the late-book reason.
