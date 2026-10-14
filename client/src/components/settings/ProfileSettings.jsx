import { useMemo, useRef, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import api, { errMsg } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import Avatar from '../Avatar';
import ConfirmModal from '../ConfirmModal';
import FieldLimit from '../FieldLimit';
import LoadingButton from '../LoadingButton';
import { prepareAvatar } from '../../utils/imageResize';
import { MEMBER } from '../../utils/limits';
import { PH_MOBILE } from '../../utils/members';

// The editable part of the profile, as trimmed strings (used to detect unsaved changes)
const pick = (u) => ({ name: u?.name || '', contactNumber: u?.contactNumber || '', address: u?.address || '' });
const same = (a, b) => ['name', 'contactNumber', 'address'].every((k) => a[k].trim() === b[k].trim());

// Settings → Profile. Works for any logged-in user (librarian now, members later): it only uses
// /api/auth/* routes, which always act on the CURRENT account.
export default function ProfileSettings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const fileRef = useRef(null);
  const [form, setForm] = useState(() => pick(user));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const dirty = useMemo(() => !same(form, pick(user)), [form, user]);
  useUnsavedChanges(dirty && !saving);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  // ---- Photo: crop/resize in the browser, then upload right away ----
  const onPhoto = async (file) => {
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      const { blob, url } = await prepareAvatar(file); // 256×256 JPEG
      URL.revokeObjectURL(url);
      const fd = new FormData();
      fd.append('avatar', blob, 'avatar.jpg');
      const res = await api.put('/auth/avatar', fd);
      setUser(res.data.user); // new avatarKey -> every <Avatar> of this user shows the new photo
      toast.success('Profile photo updated');
    } catch (err) {
      const msg = err.response ? errMsg(err) : err.message;
      setPhotoError(msg);
      toast.error(msg);
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      const res = await api.delete('/auth/avatar');
      setUser(res.data.user);
      toast.success('Profile photo removed');
      setConfirmRemove(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setPhotoBusy(false);
    }
  };

  // ---- Profile fields ----
  const save = async (e) => {
    e.preventDefault();
    const found = {};
    if (!form.name.trim()) found.name = 'Name is required';
    if (form.contactNumber.trim() && !PH_MOBILE.test(form.contactNumber.trim())) found.contactNumber = 'Use 09XXXXXXXXX or +639XXXXXXXXX';
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const res = await api.put('/auth/profile', {
        name: form.name.trim(), contactNumber: form.contactNumber.trim(), address: form.address.trim(),
      });
      setUser(res.data.user);
      setForm(pick(res.data.user));
      toast.success('Profile saved');
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
      <section className="panel p-4 mb-4" aria-labelledby="photo-title">
        <h2 id="photo-title" className="form-section-title">Profile photo</h2>
        <div className="d-flex align-items-center gap-4 flex-wrap">
          <Avatar name={user.name} avatarKey={user.avatarKey} size="xl" />
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="d-none" onChange={(e) => onPhoto(e.target.files?.[0])} />
            <div className="d-flex gap-2 flex-wrap">
              <LoadingButton variant="outline-secondary" size="sm" loading={photoBusy} loadingText="Uploading..." onClick={() => fileRef.current?.click()}>
                {user.avatarKey ? 'Change photo' : 'Upload photo'}
              </LoadingButton>
              {user.avatarKey && (
                <Button variant="outline-danger" size="sm" onClick={() => setConfirmRemove(true)} disabled={photoBusy}>
                  Remove photo
                </Button>
              )}
            </div>
            <p className="form-text mt-2 mb-0">JPG, PNG or WEBP up to 5 MB, at least 128×128 px. It is cropped to a square.</p>
            {photoError && <div className="invalid-feedback d-block">{photoError}</div>}
          </div>
        </div>
      </section>

      <section className="panel p-4" aria-labelledby="profile-title">
        <h2 id="profile-title" className="form-section-title">Personal details</h2>
        <Form onSubmit={save} noValidate>
          <div className="row g-3">
            <div className="col-sm-6">
              <Form.Group controlId="profile-name">
                <Form.Label>Full name</Form.Label>
                <Form.Control value={form.name} onChange={set('name')} maxLength={MEMBER.name} isInvalid={!!errors.name} />
                <Form.Control.Feedback type="invalid">{errors.name}</Form.Control.Feedback>
                <FieldLimit value={form.name} max={MEMBER.name} />
              </Form.Group>
            </div>
            <div className="col-sm-6">
              <Form.Group controlId="profile-contact">
                <Form.Label>Contact number</Form.Label>
                <Form.Control value={form.contactNumber} onChange={set('contactNumber')} maxLength={MEMBER.contact} inputMode="tel" placeholder="09XXXXXXXXX" isInvalid={!!errors.contactNumber} />
                <Form.Control.Feedback type="invalid">{errors.contactNumber}</Form.Control.Feedback>
              </Form.Group>
            </div>
            <div className="col-12">
              <Form.Group controlId="profile-address">
                <Form.Label>Address</Form.Label>
                <Form.Control value={form.address} onChange={set('address')} maxLength={MEMBER.address} isInvalid={!!errors.address} />
                <Form.Control.Feedback type="invalid">{errors.address}</Form.Control.Feedback>
                <FieldLimit value={form.address} max={MEMBER.address} />
              </Form.Group>
            </div>
          </div>

          {/* Read-only: the email is the login name and is changed on the Members page */}
          <dl className="detail-grid mt-4 mb-0">
            <div><dt>Email</dt><dd>{user.email}</dd></div>
          </dl>

          <div className="d-flex justify-content-end align-items-center gap-3 mt-4">
            {dirty && <span className="dirty-hint">Unsaved changes</span>}
            <Button variant="outline-secondary" onClick={() => { setForm(pick(user)); setErrors({}); }} disabled={!dirty || saving}>Discard</Button>
            <LoadingButton type="submit" variant="primary" loading={saving} loadingText="Saving..." disabled={!dirty}>Save changes</LoadingButton>
          </div>
        </Form>
      </section>

      <ConfirmModal
        show={confirmRemove}
        title="Remove your profile photo?"
        message="Your initials will be shown instead."
        confirmLabel="Remove photo"
        onConfirm={removePhoto}
        onCancel={() => setConfirmRemove(false)}
        loading={photoBusy}
      />
    </>
  );
}
