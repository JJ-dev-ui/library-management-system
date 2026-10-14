import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { bookHasHistory, onLoanOf } from '../../utils/books';

// Soft "Archived" badge under the title (only visible with "Show archived books")
export const ArchivedBadge = () => <span className="status-badge badge-neutral mt-1">Archived</span>;

// Icon button with a tooltip. A disabled button gets no mouse events, so the tooltip sits on a
// focusable wrapper span (keyboard users can reach it and hear the reason too).
function IconAction({ tip, disabled = false, onClick, label, danger = false, children }) {
  return (
    <OverlayTrigger overlay={<Tooltip>{tip}</Tooltip>}>
      <span className="d-inline-block" tabIndex={disabled ? 0 : -1} aria-label={disabled ? tip : undefined}>
        <button type="button" className={`btn btn-icon ${danger ? 'danger' : ''}`} onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </button>
      </span>
    </OverlayTrigger>
  );
}

// Row actions on the table and the cards:
//   archived book            -> Edit + Restore
//   book with history         -> Edit + Archive (deleting would break the old transactions)
//   book that was never lent  -> Edit + Delete
// Archive/Delete are disabled while copies are borrowed (the server refuses it too).
export default function BookActions({ book, onEdit, onDelete, onRestore }) {
  const borrowed = onLoanOf(book);
  const archive = bookHasHistory(book);
  const verb = archive ? 'archive' : 'delete';
  return (
    <>
      <IconAction tip="Edit" onClick={() => onEdit(book)} label={`Edit ${book.title}`}>
        <Pencil size={16} />
      </IconAction>
      {book.isArchived ? (
        <IconAction tip="Restore" onClick={() => onRestore?.(book)} label={`Restore ${book.title}`}>
          <ArchiveRestore size={16} />
        </IconAction>
      ) : (
        <IconAction
          tip={borrowed > 0 ? `Cannot ${verb}: ${borrowed} borrowed` : archive ? 'Archive' : 'Delete'}
          disabled={borrowed > 0}
          onClick={() => onDelete(book)}
          label={`${archive ? 'Archive' : 'Delete'} ${book.title}`}
          danger
        >
          {archive ? <Archive size={16} /> : <Trash2 size={16} />}
        </IconAction>
      )}
    </>
  );
}
