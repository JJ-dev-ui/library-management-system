import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import LoadingButton from '../LoadingButton';
import MemberFormFields from './MemberFormFields';
import { fieldErrorsFrom, validateMember } from '../../utils/members';

const EMPTY = { name: '', email: '', password: '', role: 'member', contactNumber: '', address: '', notes: '' };

// "Add member" form in a modal (POST /api/users)
export default function AddMemberModal({ show, onHide, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (show) { setForm(EMPTY); setErrors({}); } }, [show]);

  const onChange = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateMember(form, { withPassword: true });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(), email: form.email.trim(), contactNumber: form.contactNumber.trim(),
        address: form.address.trim(), notes: form.notes.trim(),
      };
      const res = await api.post('/users', payload);
      toast.success(`${res.data.user.name} was added (${res.data.user.memberId})`);
      onCreated?.(res.data.user);
      onHide();
    } catch (err) {
      const fe = fieldErrorsFrom(err);
      if (err.response?.status === 409) fe.email = errMsg(err);
      setErrors(fe);
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={saving ? undefined : onHide} size="lg" fullscreen="sm-down" centered aria-labelledby="add-member-title">
      <Form onSubmit={submit} noValidate>
        <Modal.Header closeButton={!saving}>
          <Modal.Title id="add-member-title">Add member</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="meta">A member ID (LIB-YYYY-NNNN) is created automatically.</p>
          <MemberFormFields form={form} errors={errors} onChange={onChange} withPassword disabled={saving} />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>Cancel</Button>
          <LoadingButton type="submit" variant="primary" loading={saving} loadingText="Saving...">Add member</LoadingButton>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
