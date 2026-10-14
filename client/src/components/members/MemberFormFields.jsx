import { Form } from 'react-bootstrap';
import FieldLimit from '../FieldLimit';
import { MEMBER } from '../../utils/limits';

// The profile inputs, shared by "Add member" and the Profile tab's edit mode.
// lockRole: the role select is disabled (you cannot change your own role).
export default function MemberFormFields({ form, errors, onChange, withPassword = false, lockRole = false, disabled = false }) {
  // maxLength stops typing at the limit; FieldLimit shows "120/200" near it and "Max characters reached" at it
  const field = (key, label, props = {}, required = false) => (
    <Form.Group controlId={`member-${key}`}>
      <Form.Label>{label}{required && <span className="text-danger" aria-hidden="true"> *</span>}</Form.Label>
      <Form.Control value={form[key]} onChange={onChange(key)} isInvalid={!!errors[key]} disabled={disabled} {...props} />
      <Form.Control.Feedback type="invalid">{errors[key]}</Form.Control.Feedback>
      {props.maxLength && key !== 'password' && <FieldLimit value={form[key]} max={props.maxLength} />}
    </Form.Group>
  );

  return (
    <div className="row g-3">
      <div className="col-sm-6">{field('name', 'Full name', { maxLength: MEMBER.name, autoComplete: 'off' }, true)}</div>
      <div className="col-sm-6">{field('email', 'Email', { type: 'email', autoComplete: 'off', maxLength: MEMBER.email }, true)}</div>
      {withPassword && (
        <div className="col-sm-6">{field('password', 'Password', { type: 'password', autoComplete: 'new-password', maxLength: MEMBER.passwordMax }, true)}</div>
      )}
      <div className="col-sm-6">
        <Form.Group controlId="member-role">
          <Form.Label>Role</Form.Label>
          <Form.Select value={form.role} onChange={onChange('role')} disabled={disabled || lockRole}>
            <option value="member">Member</option>
            <option value="admin">Librarian</option>
          </Form.Select>
          {lockRole && <Form.Text>You cannot change your own role.</Form.Text>}
        </Form.Group>
      </div>
      <div className="col-sm-6">{field('contactNumber', 'Contact number', { inputMode: 'tel', placeholder: '09XXXXXXXXX', maxLength: MEMBER.contact })}</div>
      <div className="col-12">{field('address', 'Address', { maxLength: MEMBER.address })}</div>
      <div className="col-12">
        {field('notes', 'Notes (librarians only)', { as: 'textarea', rows: 3, maxLength: MEMBER.notes })}
      </div>
    </div>
  );
}
