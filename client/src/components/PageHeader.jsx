// Same header on every admin page: title + one-line description on the left, actions on the right
export default function PageHeader({ title, description, children }) {
  return (
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
