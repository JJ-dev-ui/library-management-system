import { useEffect, useMemo, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import { Search } from 'lucide-react';

// Searchable grid of categories with their book counts. Picking one closes the modal.
export default function CategoryModal({ show, onHide, categories, value, onSelect }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (show) setQ(''); }, [show]);

  const total = categories.reduce((sum, c) => sum + c.count, 0);
  const visible = useMemo(
    () => categories.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())),
    [categories, q]
  );

  const pick = (name) => {
    onSelect(name);
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" fullscreen="sm-down" centered scrollable aria-labelledby="category-title">
      <Modal.Header closeButton>
        <Modal.Title id="category-title">Choose a category</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="input-group mb-3">
          <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
          <Form.Control
            type="search"
            placeholder="Search categories"
            aria-label="Search categories"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={50}
            autoFocus
          />
        </div>
        <div className="category-grid">
          {!q && (
            <button type="button" className={`category-option ${!value ? 'active' : ''}`} onClick={() => pick('')} aria-pressed={!value}>
              <span>All categories</span>
              <span className="count">{total}</span>
            </button>
          )}
          {visible.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`category-option ${value === c.name ? 'active' : ''}`}
              onClick={() => pick(c.name)}
              aria-pressed={value === c.name}
            >
              <span className="text-truncate">{c.name}</span>
              <span className="count">{c.count}</span>
            </button>
          ))}
        </div>
        {visible.length === 0 && <p className="meta text-center my-4">No category matches “{q}”.</p>}
      </Modal.Body>
    </Modal>
  );
}
