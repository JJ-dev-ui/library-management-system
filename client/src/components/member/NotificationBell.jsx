import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import api, { errMsg } from '../../api';
import { useMember } from '../../context/MemberContext';
import NotificationItem, { groupBySeen } from './NotificationItem';

// Opens a notification: mark it read (once), then go where it points (My Books tab, a book, Home…)
export function useOpenNotification(onDone) {
  const navigate = useNavigate();
  return async (n, setItems) => {
    if (!n.readAt) {
      setItems?.((list) => list.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)));
      api.put(`/me/notifications/${n._id}/read`).catch(() => {});
    }
    onDone?.();
    if (n.link) navigate(n.link);
  };
}

// The bell in the top bar (Facebook behaviour):
//   badge  = notifications that arrived since the bell was last opened ("unseen")
//   open   = the badge resets to 0 at once; the items stay highlighted until clicked ("unread")
//   panel  = latest 20, grouped "New" / "Earlier" (a full-screen sheet on phones, see member.css)
export default function NotificationBell() {
  const { unseen, setUnseen, markSeen } = useMember();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null); // { items, seenAt, unread }
  const [error, setError] = useState('');
  const box = useRef(null);
  const openNotification = useOpenNotification(() => setOpen(false));
  const setItems = (fn) => setData((d) => (d ? { ...d, items: fn(d.items) } : d));

  // Every time the panel opens: load the list (it brings the PREVIOUS "seen" time, used for the
  // groups), then mark everything as seen
  useEffect(() => {
    if (!open) return undefined;
    const ctrl = new AbortController();
    setData(null); setError('');
    setUnseen(0); // badge -> 0 immediately (optimistic)
    api.get('/me/notifications', { params: { limit: 20 }, signal: ctrl.signal })
      .then((res) => {
        setData({ items: res.data.notifications, seenAt: res.data.seenAt, unread: res.data.unread });
        markSeen(); // saved on the server AFTER the list, so the list still had the previous "seen" time
      })
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setError(errMsg(err)); });
    return () => ctrl.abort();
  }, [open, markSeen, setUnseen]);

  // Close on a click outside the panel, or Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const anyUnread = data?.items.some((n) => !n.readAt);
  const markAll = () => {
    setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    api.put('/me/notifications/read-all').catch(() => {});
  };

  return (
    <div className="notif-wrap" ref={box}>
      <button type="button" className="topbar-icon" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label={unseen ? `Notifications, ${unseen} new` : 'Notifications'} title="Notifications">
        <Bell size={20} />
        {unseen > 0 && <span className="count-badge">{unseen > 99 ? '99+' : unseen}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <h2 className="h6 mb-0">Notifications</h2>
            <button type="button" className="btn btn-link btn-sm p-0 ms-auto" onClick={markAll} disabled={!anyUnread}>Mark all as read</button>
            <button type="button" className="btn btn-icon d-sm-none" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
          </div>
          <div className="notif-list">
            {error && <p className="text-danger small p-3 mb-0">{error}</p>}
            {!data && !error && <div className="p-3"><Skeleton count={4} height={44} className="mb-2" /></div>}
            {data?.items.length === 0 && <p className="meta text-center p-4 mb-0">No notifications yet.</p>}
            {data && groupBySeen(data.items, data.seenAt).map((g) => (
              <div key={g.title}>
                <div className="notif-group">{g.title}</div>
                {g.items.map((n) => <NotificationItem key={n._id} n={n} onOpen={(x) => openNotification(x, setItems)} />)}
              </div>
            ))}
          </div>
          <div className="notif-panel-foot">
            <Link to="/notifications" onClick={() => setOpen(false)}>See all</Link>
          </div>
        </div>
      )}
    </div>
  );
}
