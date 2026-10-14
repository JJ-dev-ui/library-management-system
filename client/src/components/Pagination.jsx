import { ChevronLeft, ChevronRight } from 'lucide-react';

// Which page numbers to show. Long lists are shortened with "…", always keeping the first and last page:
//   page 1 of 100  -> 1 2 3 4 5 … 100
//   page 50 of 100 -> 1 … 49 50 51 … 100
//   page 98 of 100 -> 1 … 96 97 98 99 100
function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', pages];
  if (page >= pages - 3) return [1, '…', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, '…', page - 1, page, page + 1, '…', pages];
}

// Previous / page numbers / Next
export default function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;

  return (
    <nav aria-label="Pagination">
      <ul className="pagination pagination-sm mb-0 flex-wrap">
        <li className={`page-item ${page === 1 ? 'disabled' : ''}`}>
          <button className="page-link" onClick={() => onChange(page - 1)} aria-label="Previous page" disabled={page === 1}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
        </li>
        {pageItems(page, pages).map((n, i) => (
          n === '…' ? (
            <li key={`gap-${i}`} className="page-item disabled" aria-hidden="true">
              <span className="page-link">…</span>
            </li>
          ) : (
            <li key={n} className={`page-item ${n === page ? 'active' : ''}`}>
              <button className="page-link" onClick={() => onChange(n)} aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined}>
                {n}
              </button>
            </li>
          )
        ))}
        <li className={`page-item ${page === pages ? 'disabled' : ''}`}>
          <button className="page-link" onClick={() => onChange(page + 1)} aria-label="Next page" disabled={page === pages}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
