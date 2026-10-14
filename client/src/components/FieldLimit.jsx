// Small helper under a text field:
// - stays hidden while the text is short (no visual noise)
// - shows "120/200" once the text is above 80% of the limit
// - shows "Max characters reached" (soft red) when the limit is hit; the input's maxLength stops typing there
export default function FieldLimit({ value = '', max, id }) {
  const length = String(value).length;
  if (length <= max * 0.8) return null;
  const full = length >= max;
  return (
    <div className={`field-limit ${full ? 'is-full' : ''}`} id={id} aria-live="polite">
      <span>{full ? 'Max characters reached' : ''}</span>
      <span>{length}/{max}</span>
    </div>
  );
}
