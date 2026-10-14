import { Button, Modal } from 'react-bootstrap';
import LoadingButton from './LoadingButton';

// Reusable "Are you sure?" dialog for logout and every destructive action.
// It uses the "top" layer classes so it always opens above any other modal (e.g. book details).
export default function ConfirmModal({
  show, title, message, confirmLabel = 'Confirm', confirmVariant = 'danger',
  onConfirm, onCancel, loading = false,
}) {
  return (
    <Modal
      show={show}
      onHide={loading ? undefined : onCancel} // cannot be closed while the action is running
      centered
      fullscreen="sm-down"
      className="modal-top"
      backdropClassName="modal-backdrop-top"
      aria-labelledby="confirm-title"
    >
      <Modal.Header closeButton={!loading}>
        <Modal.Title id="confirm-title">{title}</Modal.Title>
      </Modal.Header>
      {message && <Modal.Body><p className="mb-0">{message}</p></Modal.Body>}
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
        <LoadingButton variant={confirmVariant} onClick={onConfirm} loading={loading} loadingText="Please wait...">
          {confirmLabel}
        </LoadingButton>
      </Modal.Footer>
    </Modal>
  );
}
