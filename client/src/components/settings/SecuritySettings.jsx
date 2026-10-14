import { useEffect, useState } from 'react';
import { Button, Collapse, Form } from 'react-bootstrap';
import Skeleton from 'react-loading-skeleton';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import api, { errMsg } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import LoadingButton from '../LoadingButton';
import { formatDateTime } from '../../utils/format';
import { MEMBER } from '../../utils/limits';

// Rough password strength: one point each for length 8+, length 12+, upper+lower case, a digit, a symbol
export function passwordStrength(pw) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < MEMBER.passwordMin || score <= 1) return { label: 'Weak', pct: 25, tone: 'danger' };
  if (score === 2) return { label: 'Fair', pct: 50, tone: 'warning' };
  if (score === 3) return { label: 'Good', pct: 75, tone: 'info' };
  return { label: 'Strong', pct: 100, tone: 'success' };
}

// Password input with a show/hide (eye) button
function PasswordField({ id, label, value, onChange, error, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <Form.Group controlId={id}>
      <Form.Label>{label}</Form.Label>
      <div className="input-group">
        <Form.Control type={show ? 'text' : 'password'} value={value} onChange={onChange} maxLength={MEMBER.passwordMax}
          autoComplete={autoComplete} isInvalid={!!error} />
        <Button variant="outline-secondary" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>
        {error && <div className="invalid-feedback d-block">{error}</div>}
      </div>
    </Form.Group>
  );
}

const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };

// Settings → Security: recent logins + change password (signs out every OTHER device)
export default function SecuritySettings() {
  const { setUser, replaceToken } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/auth/logins').then((res) => setInfo(res.data)).catch(() => setInfo({ logins: [] }));
  }, []);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };
  const close = () => { setOpen(false); setForm(EMPTY); setErrors({}); };

  const strength = passwordStrength(form.newPassword);
  const lengthOk = form.newPassword.length >= MEMBER.passwordMin && form.newPassword.length <= MEMBER.passwordMax;
  const matches = form.confirm.length > 0 && form.confirm === form.newPassword;
  const differs = form.newPassword !== form.currentPassword;
  const valid = form.currentPassword && lengthOk && matches && differs;

  const save = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      const res = await api.put('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      replaceToken(res.data.token); // the new token keeps THIS device logged in
      setUser(res.data.user);
      toast.success("Password changed. You've been signed out on other devices.");
      close();
    } catch (err) {
      const fe = {};
      (err.response?.data?.errors || []).forEach((x) => { if (!fe[x.path]) fe[x.path] = x.msg; });
      setErrors(fe);
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="panel p-4 mb-4" aria-labelledby="logins-title">
        <h2 id="logins-title" className="form-section-title">Sign-in activity</h2>
        {!info ? <Skeleton count={4} height={22} className="mb-2" /> : (
          <>
            <dl className="detail-grid mb-3">
              <div><dt>Last login</dt><dd>{formatDateTime(info.lastLoginAt)}</dd></div>
              <div><dt>Device</dt><dd>{info.lastLoginDevice || '—'}</dd></div>
              <div><dt>IP address</dt><dd className="mono">{info.lastLoginIp || '—'}</dd></div>
            </dl>
            {info.logins.length > 0 && (
              <div className="table-scroll border rounded-3">
                <table className="table mini-table align-middle mb-0">
                  <thead><tr><th scope="col">Date and time</th><th scope="col">Device</th><th scope="col" className="d-none d-sm-table-cell">IP address</th></tr></thead>
                  <tbody>
                    {info.logins.map((l) => (
                      <tr key={l._id}>
                        <td className="text-nowrap">{formatDateTime(l.createdAt)}</td>
                        <td className="cell-muted">{l.device || '—'}</td>
                        <td className="d-none d-sm-table-cell mono cell-muted">{l.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="meta small mt-2 mb-0">Your last 5 sign-ins. If you do not recognise one, change your password.</p>
          </>
        )}
      </section>

      <section className="panel p-4" aria-labelledby="password-title">
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <div>
            <h2 id="password-title" className="form-section-title mb-1">Password</h2>
            <p className="meta mb-0">Changing it signs you out on every other device.</p>
          </div>
          {!open && (
            <Button variant="outline-secondary" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="password-form">
              Change password
            </Button>
          )}
        </div>

        {/* Collapse = smooth open/close animation (react-bootstrap) */}
        <Collapse in={open}>
          <div id="password-form">
            <Form onSubmit={save} noValidate className="pt-4 d-grid gap-3">
              <PasswordField id="pw-current" label="Current password" value={form.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} autoComplete="current-password" />
              <div>
                <PasswordField id="pw-new" label="New password" value={form.newPassword} onChange={set('newPassword')} error={errors.newPassword} autoComplete="new-password" />
                {strength && (
                  <div className="mt-2" aria-live="polite">
                    <div className="progress pw-strength" role="progressbar" aria-label="Password strength" aria-valuenow={strength.pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`progress-bar bg-${strength.tone}`} style={{ width: `${strength.pct}%` }} />
                    </div>
                    <div className="d-flex justify-content-between small mt-1">
                      <span className="meta">Strength: <strong>{strength.label}</strong></span>
                      {!lengthOk && <span className="meta">{MEMBER.passwordMin}–{MEMBER.passwordMax} characters</span>}
                      {lengthOk && !differs && <span className="text-danger">Must differ from the current password</span>}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <PasswordField id="pw-confirm" label="Confirm new password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
                {form.confirm && (
                  <div className={`small mt-1 d-flex align-items-center gap-1 ${matches ? 'text-success' : 'text-danger'}`} aria-live="polite">
                    {matches ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                    {matches ? 'Passwords match' : 'Passwords do not match'}
                  </div>
                )}
              </div>
              <div className="d-flex justify-content-end gap-2">
                <Button variant="outline-secondary" onClick={close} disabled={saving}>Cancel</Button>
                <LoadingButton type="submit" variant="primary" loading={saving} loadingText="Saving..." disabled={!valid}>Save new password</LoadingButton>
              </div>
            </Form>
          </div>
        </Collapse>
      </section>
    </>
  );
}
