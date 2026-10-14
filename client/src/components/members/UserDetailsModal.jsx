import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal, OverlayTrigger, Tab, Tabs, Tooltip } from 'react-bootstrap';
import api, { errMsg } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Avatar from '../Avatar';
import ConfirmModal from '../ConfirmModal';
import LoadingButton from '../LoadingButton';
import DetailSkeleton from '../skeletons/DetailSkeleton';
import BorrowingHistory from './BorrowingHistory';
import TransactionDetailsModal from '../transactions/TransactionDetailsModal';
import MemberFormFields from './MemberFormFields';
import { AccountStatusBadge, RoleBadge } from './MemberBadges';
import { fieldErrorsFrom, roleLabel, validateMember } from '../../utils/members';
import { formatDate, formatDateTime, timeAgo } from '../../utils/format';
import { MEMBER } from '../../utils/limits';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import Skeleton from 'react-loading-skeleton';
import { LATE, MESSAGES } from '../../utils/labels';

const MEMBER_HAS_HISTORY = MESSAGES.memberHasHistory; // same words as the server's refusal

const toForm = (u) => ({
  name: u.name || '', email: u.email || '', role: u.role || 'member',
  contactNumber: u.contactNumber || '', address: u.address || '', notes: u.notes || '',
});

// Member / librarian details with tabs: Profile (view + edit), Borrowing history, Login activity, Security.
// Your OWN account hides the self-destructive actions (deactivate, delete, change role).
export default function UserDetailsModal({ show, userId, onHide, onChanged, onDeleted }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('profile');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [pwd, setPwd] = useState({ password: '', confirm: '' });
  const [pwdErrors, setPwdErrors] = useState({});
  const [pwdSaving, setPwdSaving] = useState(false);

  const [confirm, setConfirm] = useState(null); // 'toggle' | 'delete'
  const [acting, setActing] = useState(false);
  const [txId, setTxId] = useState(null); // transaction opened from the borrowing history

  // Load (or reload) everything about this user each time the modal opens
  useEffect(() => {
    if (!show || !userId) return undefined;
    const ctrl = new AbortController();
    setData(null); setError(''); setTab('profile'); setEditing(false);
    setPwd({ password: '', confirm: '' }); setPwdErrors({});
    api.get(`/users/${userId}`, { signal: ctrl.signal })
      .then((res) => setData(res.data))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setError(errMsg(err)); });
    return () => ctrl.abort();
  }, [show, userId]);

  // Quiet reload after a change made in the transaction modal (return/extend): no skeleton, same tab
  const reloadData = () => {
    api.get(`/users/${userId}`).then((res) => setData(res.data)).catch(() => {});
    onChanged?.();
  };

  const u = data?.user;
  const stats = data?.stats;
  const isSelf = u && me && u._id === me._id;

  const startEdit = () => { setForm(toForm(u)); setErrors({}); setEditing(true); };

  // Unsaved changes: compare the trimmed form with the profile as loaded
  const normalize = (f) => JSON.stringify(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v).trim()])));
  const profileDirty = useMemo(() => show && editing && !!form && !!u && normalize(form) !== normalize(toForm(u)), [show, editing, form, u]);
  // Closing the modal ends the edit, so the "leave page?" guard does not stay switched on
  useEffect(() => { if (!show) setEditing(false); }, [show]);
  useUnsavedChanges(profileDirty && !saving); // browser prompt when closing/refreshing the page
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cancelEdit = () => (profileDirty ? setConfirmDiscard(true) : setEditing(false));
  const onChange = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    const found = validateMember(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), email: form.email.trim(), contactNumber: form.contactNumber.trim(),
        address: form.address.trim(), notes: form.notes.trim(),
        ...(isSelf ? {} : { role: form.role }), // never send a role change for your own account
      };
      const res = await api.put(`/users/${u._id}`, payload);
      setData((d) => ({ ...d, user: res.data.user }));
      setEditing(false);
      toast.success('Profile updated');
      onChanged?.();
    } catch (err) {
      const fe = fieldErrorsFrom(err);
      if (err.response?.status === 409) fe.email = errMsg(err);
      setErrors(fe);
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    const found = {};
    if (pwd.password.length < MEMBER.passwordMin || pwd.password.length > MEMBER.passwordMax) {
      found.password = `Password must be ${MEMBER.passwordMin} to ${MEMBER.passwordMax} characters`;
    }
    if (pwd.confirm !== pwd.password) found.confirm = 'Passwords do not match';
    setPwdErrors(found);
    if (Object.keys(found).length) return;
    setPwdSaving(true);
    try {
      await api.put(`/users/${u._id}/password`, { password: pwd.password });
      setPwd({ password: '', confirm: '' });
      toast.success(`New password set for ${u.name}`);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setPwdSaving(false);
    }
  };

  const runConfirm = async () => {
    setActing(true);
    try {
      if (confirm === 'delete') {
        await api.delete(`/users/${u._id}`);
        toast.success(`${u.name}'s account was deleted`);
        setConfirm(null);
        onDeleted?.();
      } else {
        const res = await api.put(`/users/${u._id}`, { isActive: !u.isActive });
        setData((d) => ({ ...d, user: res.data.user }));
        toast.success(`${u.name} was ${res.data.user.isActive ? 'activated' : 'deactivated'}`);
        setConfirm(null);
        onChanged?.();
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActing(false);
    }
  };

  // Any borrowing history (even returned books) -> the account can only be deactivated
  const hasHistory = !!stats?.hasHistory;

  // Deactivate warning: load the member's CURRENT books when the confirmation opens
  // (the numbers in the modal may be a few minutes old). null = still loading.
  const [current, setCurrent] = useState(null);
  const confirmingDeactivate = confirm === 'toggle' && !!u?.isActive;
  useEffect(() => {
    if (!confirmingDeactivate) return undefined;
    const ctrl = new AbortController();
    setCurrent(null);
    api.get(`/users/${u._id}`, { signal: ctrl.signal })
      .then((res) => setCurrent(res.data.stats))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setCurrent({ failed: true }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingDeactivate]);

  const deactivateMessage = () => {
    const base = "They won't be able to log in";
    if (!current) return <Skeleton width="90%" />; // skeleton line while the counts load
    if (current.failed || !current.activeLoans) return `${base}. They are signed out right away.`;
    const n = current.activeLoans;
    const late = current.overdueLoans ? ` (${LATE.count(current.overdueLoans)})` : '';
    return `${u.name} still has ${n} borrowed ${n === 1 ? 'book' : 'books'}${late}. ${base}, but the books stay on their record.`;
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="xl" fullscreen="sm-down" centered scrollable aria-labelledby="user-details-title">
        <Modal.Header closeButton>
          <Modal.Title id="user-details-title">{u ? `${roleLabel(u.role)} details` : 'Account details'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {!u && !error && <DetailSkeleton variant="profile" />}
          {u && (
            <>
              <div className="d-flex align-items-center gap-3 mb-3">
                <Avatar name={u.name} avatarKey={u.avatarKey} size="lg" />
                <div className="min-w-0">
                  <h2 className="h5 mb-1 text-truncate">{u.name}{isSelf && <span className="meta fw-normal"> (you)</span>}</h2>
                  <div className="d-flex flex-wrap align-items-center gap-2">
                    <span className="mono meta">{u.memberId || 'No member ID'}</span>
                    <RoleBadge role={u.role} />
                    <AccountStatusBadge isActive={u.isActive} />
                  </div>
                </div>
              </div>

              <Tabs activeKey={tab} onSelect={(k) => setTab(k)} variant="underline" className="mb-4" mountOnEnter>
                {/* ---------- Profile ---------- */}
                <Tab eventKey="profile" title="Profile">
                  {editing ? (
                    <Form onSubmit={saveProfile} noValidate>
                      <MemberFormFields form={form} errors={errors} onChange={onChange} lockRole={isSelf} disabled={saving} />
                      <div className="d-flex justify-content-end align-items-center gap-3 mt-3">
                        {profileDirty && <span className="dirty-hint">Unsaved changes</span>}
                        <Button variant="outline-secondary" onClick={cancelEdit} disabled={saving}>Cancel</Button>
                        {/* Disabled until something changed */}
                        <LoadingButton type="submit" variant="primary" loading={saving} loadingText="Saving..." disabled={!profileDirty}>Save changes</LoadingButton>
                      </div>
                    </Form>
                  ) : (
                    <>
                      <dl className="detail-grid mb-3">
                        <div><dt>Email</dt><dd>{u.email}</dd></div>
                        <div><dt>Contact number</dt><dd>{u.contactNumber || '—'}</dd></div>
                        <div><dt>Address</dt><dd>{u.address || '—'}</dd></div>
                        <div><dt>Joined</dt><dd>{formatDate(u.createdAt)}</dd></div>
                        <div>
                          <dt>Last login</dt>
                          <dd>{u.lastLoginAt ? `${timeAgo(u.lastLoginAt)} · ${u.lastLoginDevice || 'Unknown device'}` : 'Never'}</dd>
                        </div>
                        <div><dt>Last IP address</dt><dd className="mono">{u.lastLoginIp || '—'}</dd></div>
                      </dl>
                      <div className="section-label">Notes</div>
                      <p className="description">{u.notes || <span className="meta">No notes.</span>}</p>
                      <Button variant="outline-secondary" size="sm" onClick={startEdit}>
                        Edit profile
                      </Button>
                    </>
                  )}
                </Tab>

                {/* ---------- Borrowing history ---------- */}
                <Tab eventKey="history" title="Borrowing history">
                  <BorrowingHistory history={data.history} stats={stats} onOpen={(t) => setTxId(t._id)} />
                </Tab>

                {/* ---------- Login activity ---------- */}
                <Tab eventKey="logins" title="Login activity">
                  {data.logins.length === 0 ? (
                    <p className="meta mb-0">This account has never logged in.</p>
                  ) : (
                    <div className="table-scroll border rounded-3">
                      <table className="table mini-table align-middle mb-0">
                        <thead>
                          <tr><th scope="col">Date and time</th><th scope="col">IP address</th><th scope="col" className="d-none d-sm-table-cell">Device</th></tr>
                        </thead>
                        <tbody>
                          {data.logins.map((l) => (
                            <tr key={l._id}>
                              <td className="text-nowrap">{formatDateTime(l.createdAt)}</td>
                              <td className="mono">{l.ip || '—'}</td>
                              <td className="d-none d-sm-table-cell">{l.device || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="meta small mt-2 mb-0">Last 10 successful logins.</p>
                </Tab>

                {/* ---------- Security ---------- */}
                <Tab eventKey="security" title="Security">
                  <Form onSubmit={savePassword} noValidate style={{ maxWidth: 420 }}>
                    <p className="meta">Set a new password for this account. Tell the person their new password in a safe way.</p>
                    <Form.Group className="mb-3" controlId="new-password">
                      <Form.Label>New password</Form.Label>
                      <Form.Control type="password" autoComplete="new-password" maxLength={MEMBER.passwordMax} value={pwd.password}
                        onChange={(e) => setPwd((p) => ({ ...p, password: e.target.value }))} isInvalid={!!pwdErrors.password} />
                      <Form.Control.Feedback type="invalid">{pwdErrors.password}</Form.Control.Feedback>
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="confirm-password">
                      <Form.Label>Confirm new password</Form.Label>
                      <Form.Control type="password" autoComplete="new-password" maxLength={MEMBER.passwordMax} value={pwd.confirm}
                        onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} isInvalid={!!pwdErrors.confirm} />
                      <Form.Control.Feedback type="invalid">{pwdErrors.confirm}</Form.Control.Feedback>
                    </Form.Group>
                    <LoadingButton type="submit" variant="primary" loading={pwdSaving} loadingText="Saving...">Set new password</LoadingButton>
                  </Form>
                </Tab>
              </Tabs>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <Button variant="outline-secondary" onClick={onHide}>Close</Button>
          {u && !isSelf && (
            <div className="d-flex flex-wrap gap-2">
              {/* Disabled buttons get no mouse events: the tooltip sits on a focusable wrapper */}
              <OverlayTrigger overlay={<Tooltip>{hasHistory ? MEMBER_HAS_HISTORY : 'Delete this account'}</Tooltip>}>
                <span className="d-inline-block" tabIndex={hasHistory ? 0 : -1} aria-label={hasHistory ? MEMBER_HAS_HISTORY : undefined}>
                  <Button variant="outline-danger" onClick={() => setConfirm('delete')} disabled={hasHistory}>
                    Delete
                  </Button>
                </span>
              </OverlayTrigger>
              <Button variant={u.isActive ? 'outline-danger' : 'primary'} onClick={() => setConfirm('toggle')}>
                {u.isActive
                  ? <>Deactivate</>
                  : <>Activate</>}
              </Button>
            </div>
          )}
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        show={!!confirm}
        title={confirm === 'delete' ? `Delete ${u?.name}?` : u?.isActive ? `Deactivate ${u?.name}?` : `Activate ${u?.name}?`}
        message={confirm === 'delete'
          ? 'The account and its login history are removed. This cannot be undone.'
          : u?.isActive
            ? deactivateMessage()
            : 'They will be able to log in and borrow books again.'}
        confirmLabel={confirm === 'delete' ? 'Delete account' : u?.isActive ? 'Deactivate' : 'Activate'}
        confirmVariant={confirm === 'toggle' && !u?.isActive ? 'primary' : 'danger'}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
        loading={acting}
      />

      <ConfirmModal
        show={confirmDiscard}
        title="Discard unsaved changes?"
        message="The changes you made to this profile will be lost."
        confirmLabel="Discard changes"
        onConfirm={() => { setConfirmDiscard(false); setEditing(false); }}
        onCancel={() => setConfirmDiscard(false)}
      />

      {/* Opens one layer above this modal (level 1) */}
      <TransactionDetailsModal show={!!txId} txId={txId} level={1} onHide={() => setTxId(null)} onChanged={reloadData} />
    </>
  );
}
