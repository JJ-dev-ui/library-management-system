import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import LoadingButton from '../LoadingButton';
import FieldLimit from '../FieldLimit';

const NOTE_MAX = 300; // same limit as the server

// "Deny" with an optional note for the member (shown in their My Books → Requests and notification)
export default function DenyRequestModal({ request, onHide, onConfirm, loading }) {
  const [note, setNote] = useState('');
  useEffect(() => { if (request) setNote(''); }, [request]);
  return (
    <Modal show={!!request} onHide={loading ? undefined : onHide} centered fullscreen="sm-down" className="modal-top" backdropClassName="modal-backdrop-top">
      <Modal.Header closeButton={!loading}>
        <Modal.Title className="h5">Deny this request?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          {request?.user?.name || 'The member'} asked for <strong>{request?.book?.title || 'a book'}</strong>.
          They will get a notification.
        </p>
        <Form.Group controlId="deny-note">
          <Form.Label>Note for the member (optional)</Form.Label>
          <Form.Control as="textarea" rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. All copies are reserved for the Grade 12 research class this week." />
          <FieldLimit value={note} max={NOTE_MAX} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={loading}>Cancel</Button>
        <LoadingButton variant="danger" loading={loading} loadingText="Denying..." onClick={() => onConfirm(note.trim())}>Deny request</LoadingButton>
      </Modal.Footer>
    </Modal>
  );
}
