import { AlarmClock, BellRing, BookmarkCheck, CalendarClock, CircleCheck, CircleX, Clock3, Sparkles, Trophy, Undo2 } from 'lucide-react';
import { timeAgo, formatDateTime } from '../../utils/format';

// Icon + soft colour per notification type
const LOOK = {
  request_approved: { icon: CircleCheck, tone: 'success' },
  request_denied: { icon: CircleX, tone: 'danger' },
  request_expired: { icon: Clock3, tone: 'neutral' },
  request_cancelled: { icon: Undo2, tone: 'neutral' },
  return_soon: { icon: CalendarClock, tone: 'warning' },
  late: { icon: AlarmClock, tone: 'danger' },
  new_books: { icon: Sparkles, tone: 'brand' },
  new_books_today: { icon: Sparkles, tone: 'brand' },
  top_book_month: { icon: Trophy, tone: 'warning' },
  bookmark_available: { icon: BookmarkCheck, tone: 'success' },
};

// Facebook-style groups: "New" = arrived after the bell was last opened, "Earlier" = the rest
export function groupBySeen(items, seenAt) {
  const since = seenAt ? new Date(seenAt) : null;
  const fresh = items.filter((n) => !since || new Date(n.createdAt) > since);
  const earlier = items.filter((n) => since && new Date(n.createdAt) <= since);
  return [{ title: 'New', items: fresh }, { title: 'Earlier', items: earlier }].filter((g) => g.items.length);
}

// One notification row (bell dropdown and the /notifications page). Unread = bold title + a dot.
export default function NotificationItem({ n, onOpen }) {
  const { icon: Icon, tone } = LOOK[n.type] || { icon: BellRing, tone: 'brand' };
  const unread = !n.readAt;
  return (
    <button type="button" className={`notif-item ${unread ? 'is-unread' : ''}`} onClick={() => onOpen(n)}>
      <span className={`notif-icon tone-${tone}`} aria-hidden="true"><Icon size={18} /></span>
      <span className="min-w-0 flex-grow-1 text-start">
        <span className="notif-title">{n.title}</span>
        <span className="notif-message">{n.message}</span>
        <span className="notif-time" title={formatDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</span>
      </span>
      {unread && <span className="notif-dot" aria-label="Unread" />}
    </button>
  );
}
