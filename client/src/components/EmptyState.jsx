// Friendly message when a list has nothing to show. `icon` is a lucide-react component.
export default function EmptyState({ icon: Icon, title, text, children }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-icon" aria-hidden="true"><Icon size={26} /></div>}
      <h3>{title}</h3>
      {text && <p className="meta mb-3">{text}</p>}
      {children}
    </div>
  );
}
