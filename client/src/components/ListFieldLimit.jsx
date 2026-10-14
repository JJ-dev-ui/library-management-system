// Helper under a comma-separated list field (Authors, Subjects), like FieldLimit for normal text:
// - "3/10 authors · longest 45/120" once the list or one of its names gets close to a limit (80%)
// - "Max authors reached" / "Max characters reached for one author" (soft red) when a limit is hit.
// The form itself stops the typing at the limits (see clampList in BookForm).
export const splitItems = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function ListFieldLimit({ value = '', maxItems, maxEach, noun = ['item', 'items'], help }) {
  const items = splitItems(value);
  const longest = items.reduce((m, x) => Math.max(m, x.length), 0);
  const fullList = items.length >= maxItems;
  const fullItem = longest >= maxEach;
  const near = items.length >= maxItems * 0.8 || longest > maxEach * 0.8;

  if (!near) return help ? <div className="form-text">{help}</div> : null;
  return (
    <div className={`field-limit ${fullList || fullItem ? 'is-full' : ''}`} aria-live="polite">
      <span>
        {fullList ? `Max ${noun[1]} reached` : fullItem ? `Max characters reached for one ${noun[0]}` : help}
      </span>
      <span className="text-nowrap">{items.length}/{maxItems} {noun[1]} · longest {longest}/{maxEach}</span>
    </div>
  );
}
