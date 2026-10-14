// The area that holds a table or the book cards.
// - refreshing: the old rows stay visible at 50% opacity with a thin animated bar on top,
//   instead of flashing skeletons while a search/filter/sort result is on its way.
// - On desktop/tablet it is also the box that scrolls (see .list-area in admin.css), so the
//   page header, stat cards, toolbar and pager stay in place.
export default function ListArea({ refreshing = false, children }) {
  return (
    <div className={`list-area ${refreshing ? 'is-refreshing' : ''}`} aria-busy={refreshing || undefined}>
      {refreshing && <div className="list-progress" role="progressbar" aria-label="Updating results" />}
      {children}
    </div>
  );
}
