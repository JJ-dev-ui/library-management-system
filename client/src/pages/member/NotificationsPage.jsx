import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { BellOff } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import api from '../../api';
import { useMember, useMemberPage } from '../../context/MemberContext';
import usePagedList from '../../hooks/usePagedList';
import EmptyState from '../../components/EmptyState';
import NotificationItem, { groupBySeen } from '../../components/member/NotificationItem';
import { useOpenNotification } from '../../components/member/NotificationBell';

// "/notifications" — every notification, 20 per page with "Load more", grouped "New" / "Earlier".
// Opening this page counts as opening the bell (the badge resets).
export default function NotificationsPage() {
  const { markSeen } = useMember();
  const openNotification = useOpenNotification();
  const [seenAt, setSeenAt] = useState(undefined); // the "seen" time BEFORE this visit (for the groups)
  const list = usePagedList(
    (page) => api.get('/me/notifications', { params: { page, limit: 20 } })
      .then((res) => { if (page === 1) setSeenAt(res.data.seenAt); return { items: res.data.notifications, hasMore: res.data.hasMore }; }),
    'notifications'
  );
  // Mark as seen only AFTER the first page arrived, so this visit's groups use the previous time
  useEffect(() => { if (seenAt !== undefined) markSeen(); }, [seenAt, markSeen]);

  const anyUnread = list.items.some((n) => !n.readAt);
  const markAll = () => {
    list.setItems((items) => items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    api.put('/me/notifications/read-all').catch(() => {});
  };

  // Side columns are in MemberLayout; this page only sets how they look
  useMemberPage();
  return (
    <>
      <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
        <h1 className="member-page-title mb-0">Notifications</h1>
        <Button variant="outline-secondary" size="sm" onClick={markAll} disabled={!anyUnread}>Mark all as read</Button>
      </div>
      <section className="panel notif-page">
        {list.initialLoading && <div className="p-3"><Skeleton count={6} height={48} className="mb-2" /></div>}
        {list.error && <p className="text-danger p-3 mb-0">{list.error}</p>}
        {!list.loading && list.items.length === 0 && <EmptyState icon={BellOff} title="No notifications yet" text="Request updates and return reminders will appear here." />}
        {groupBySeen(list.items, seenAt).map((g) => (
          <div key={g.title}>
            <div className="notif-group">{g.title}</div>
            {g.items.map((n) => <NotificationItem key={n._id} n={n} onOpen={(x) => openNotification(x, list.setItems)} />)}
          </div>
        ))}
      </section>
      {list.hasMore && list.items.length > 0 && (
        <div className="text-center my-3">
          <Button variant="outline-secondary" onClick={list.loadMore} disabled={list.loading}>{list.loading ? 'Loading…' : 'Load more'}</Button>
        </div>
      )}
    </>
  );
}
