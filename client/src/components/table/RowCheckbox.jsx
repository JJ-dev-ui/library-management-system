import { useEffect, useRef } from 'react';

// A plain Bootstrap checkbox that also supports the "indeterminate" (partly selected) look.
// indeterminate can only be set from JavaScript (there is no HTML attribute for it), hence the ref.
// The click never reaches the row/card behind it (stopPropagation), so it never opens a modal.
export default function RowCheckbox({ checked, indeterminate = false, onToggle, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="form-check-input row-check"
      checked={checked}
      // nativeEvent.shiftKey: was Shift held during the click? (used for range selection)
      onChange={(e) => onToggle(e.nativeEvent.shiftKey)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={label}
    />
  );
}
