import { X } from 'lucide-react';

// Active filters shown as removable chips, plus "Clear all". chips: [{ key, label, onRemove }]
export default function FilterChips({ chips, onClearAll }) {
  if (chips.length === 0) return null;
  return (
    <div className="chips-row" aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.key} className="chip">
          <span className="chip-text" title={c.label}>{c.label}</span>
          <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`}>
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      ))}
      <button type="button" className="btn btn-link btn-sm btn-clear-all" onClick={onClearAll}>Clear all</button>
    </div>
  );
}
