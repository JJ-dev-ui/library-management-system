import Skeleton from 'react-loading-skeleton';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Activity, BookOpen, CalendarCheck, PartyPopper } from 'lucide-react';
import Avatar from '../Avatar';
import CopyableText from '../CopyableText';
import EmptyState from '../EmptyState';
import BookCover from '../books/BookCover';
import { formatDateTime, timeAgo } from '../../utils/format';
import { ACTIVITY, activityDetail, bookTitle, memberName } from '../../utils/activity';
import { LATE } from '../../utils/labels';

const DAY_MS = 24 * 60 * 60 * 1000;

// "Today" / "Tomorrow" / "In 3 days" (calendar days, ignoring the time)
function relDay(date) {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const n = Math.round((a - b) / DAY_MS);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `In ${n} days`;
}

// Rows look like list items but work like buttons: click, or Tab + Enter/Space
const rowProps = (onOpen, label) => ({
  role: 'button',
  tabIndex: 0,
  'aria-label': label,
  onClick: onOpen,
  onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
});

// Same height as a real row, so the card does not jump when data arrives
const RowsSkeleton = ({ n = 5 }) => Array.from({ length: n }, (_, i) => (
  <div key={i} className="dash-row" aria-hidden="true">
    <Skeleton circle width={32} height={32} />
    <div className="flex-grow-1"><Skeleton width="55%" /><Skeleton width="35%" height={12} /></div>
    <Skeleton width={60} />
  </div>
));

// ---------- Returning soon: up to 5 rows, never scrollable ----------
export function ReturningSoonList({ items, loading, onOpen }) {
  if (loading) return <RowsSkeleton />;
  if (!items.length) return <EmptyState icon={CalendarCheck} title="Nothing to return in the next days" text="No borrowed book has a return date coming up." />;
  return items.map((t) => (
    <div key={t._id} className="dash-row" {...rowProps(() => onOpen(t), `Open transaction ${t.code || ''}`)}>
      <Avatar name={t.user?.name || '?'} avatarKey={t.user?.avatarKey} size="sm" />
      <div className="min-w-0 flex-grow-1">
        <div className="fw-medium text-truncate">{t.user?.name || 'Deleted user'} <span className="cell-sub mono ms-1">{t.user?.memberId}</span></div>
        <div className="cell-sub text-truncate">{t.book?.title || 'Deleted book'}</div>
      </div>
      <span className="dash-when">{relDay(t.dueDate)}</span>
    </div>
  ));
}

// ---------- Late books to follow up: up to 5 rows ----------
export function LateFollowUpList({ items, loading, onOpen }) {
  if (loading) return <RowsSkeleton />;
  if (!items.length) return <EmptyState icon={PartyPopper} title="No late books" text="Every borrowed book is still within its return date." />;
  return items.map((t) => (
    <div key={t._id} className="dash-row" {...rowProps(() => onOpen(t), `Open transaction ${t.code || ''}`)}>
      <Avatar name={t.user?.name || '?'} avatarKey={t.user?.avatarKey} size="sm" />
      <div className="min-w-0 flex-grow-1">
        <div className="fw-medium text-truncate">{t.user?.name || 'Deleted user'}</div>
        {/* CopyableText stops the click, so copying the number does not open the transaction */}
        <div className="cell-sub"><CopyableText value={t.user?.contactNumber} label="Contact number" className="copy-chip-sm" /></div>
        <div className="cell-sub text-truncate">{t.book?.title || 'Deleted book'}</div>
      </div>
      <span className="status-badge badge-danger text-nowrap">{LATE.days(t.daysLate)}</span>
    </div>
  ));
}

// ---------- Most borrowed books (in the selected range) ----------
export function MostBorrowedList({ items, loading, onOpen }) {
  if (loading) return <RowsSkeleton />;
  if (!items.length) return <EmptyState icon={BookOpen} title="No borrowings yet" text="Popular titles appear here once books are lent." />;
  return items.map((b, i) => (
    <div key={b._id} className="dash-row" {...rowProps(() => onOpen(b), `Open ${b.title}`)}>
      <span className="dash-rank" aria-hidden="true">{i + 1}</span>
      <BookCover book={b} size="sm" />
      <div className="min-w-0 flex-grow-1">
        <div className="fw-medium text-truncate">{b.title}</div>
        <div className="cell-sub text-truncate">{b.authors?.join(', ')}</div>
      </div>
      <span className="status-badge badge-brand text-nowrap">{b.count}×</span>
    </div>
  ));
}

// ---------- Recent activity table (scrolls inside its own box) ----------
export function RecentActivityTable({ items, loading }) {
  if (loading) return <Skeleton count={8} height={28} className="mb-2" />;
  if (!items.length) return <EmptyState icon={Activity} title="No activity yet" text="Lending, returns and changes will be listed here." />;
  return (
    <div className="activity-scroll">
      <table className="table data-table mini-table align-middle mb-0">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Event</th>
            <th scope="col">Member</th>
            <th scope="col" className="d-none d-md-table-cell">Book</th>
            <th scope="col" className="d-none d-sm-table-cell">By</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => {
            const meta = ACTIVITY[a.type] || { label: a.type, badge: 'badge-neutral' };
            const detail = activityDetail(a); // exports/imports: a sentence instead of member + book
            return (
              <tr key={a._id}>
                <td className="text-nowrap cell-muted">
                  {/* Relative time; the exact date and time are in the tooltip */}
                  <OverlayTrigger overlay={<Tooltip>{formatDateTime(a.createdAt)}</Tooltip>}>
                    <span tabIndex={0}>{timeAgo(a.createdAt)}</span>
                  </OverlayTrigger>
                </td>
                <td><span className={`status-badge ${meta.badge} text-nowrap`}>{meta.label}</span></td>
                <td>
                  {detail ? <span className="text-nowrap">{detail}</span> : (
                    <span className="d-inline-flex align-items-center gap-2" style={{ maxWidth: 200 }}>
                      {(a.member || a.meta?.memberName) && <Avatar name={memberName(a)} avatarKey={a.member?.avatarKey} size="xs" />}
                      <span className="text-truncate">{memberName(a)}</span>
                    </span>
                  )}
                </td>
                <td className="d-none d-md-table-cell cell-muted"><span className="cell-ellipsis">{detail ? '' : bookTitle(a)}</span></td>
                <td className="d-none d-sm-table-cell cell-muted"><span className="cell-ellipsis" style={{ maxWidth: '16ch' }} title={a.actor?.name}>{a.actor?.name || '—'}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
