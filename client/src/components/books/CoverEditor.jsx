import { useRef, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import ZoomableCover from './ZoomableCover';
import ConfirmModal from '../ConfirmModal';
import { prepareCover } from '../../utils/imageResize';
import { COVER_KIND_LABEL } from '../../utils/cover';

// Cover section of the book form:
// - preview (click to zoom) + which source is in use (uploaded / library cover from ISBN / URL / none)
// - "Upload photo" button and drag-and-drop; the photo is cropped/resized in the browser right away,
//   but only UPLOADED when the book is saved (pending)
// - "Remove uploaded photo" (asks first) when the book has an uploaded cover
// - a secondary "or use an image URL" field
export default function CoverEditor({ book, pending, onPick, onDiscard, onRemoveUploaded, coverUrl, onCoverUrlChange, urlError, disabled }) {
  const inputRef = useRef(null);
  const [kind, setKind] = useState('none');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    setWorking(true);
    try {
      onPick(await prepareCover(file)); // { blob, url } of the 300×450 JPEG
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
      if (inputRef.current) inputRef.current.value = ''; // allows picking the same file again
    }
  };

  // Drag-and-drop: preventDefault on dragover is required, otherwise the browser opens the file itself
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) handleFile(e.dataTransfer.files?.[0]);
  };

  const remove = async () => {
    setRemoving(true);
    try {
      await onRemoveUploaded();
      setConfirmRemove(false);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div
        className={`cover-drop ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <ZoomableCover book={book} size="lg" className="cover-preview" previewSrc={pending?.url} onSource={(s) => setKind(s.kind)} hint="Click to zoom" />
        <div className="min-w-0">
          <div className="meta mb-2">{COVER_KIND_LABEL[kind] || COVER_KIND_LABEL.none}</div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="d-none" onChange={(e) => handleFile(e.target.files?.[0])} />
          <div className="d-flex flex-column gap-2 align-items-start">
            <Button variant="outline-secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled || working}>
              {working ? 'Preparing…' : 'Upload photo'}
            </Button>
            {pending && (
              <Button variant="link" size="sm" className="p-0" onClick={onDiscard} disabled={disabled}>
                Discard new photo
              </Button>
            )}
            {!pending && book?.hasCustomCover && (
              <Button variant="link" size="sm" className="p-0 text-danger" onClick={() => setConfirmRemove(true)} disabled={disabled}>
                Remove uploaded photo
              </Button>
            )}
          </div>
          <p className="form-text mt-2 mb-0">JPG, PNG or WEBP, min. 200×300 px. Or drag a photo here. It is cropped to the cover shape.</p>
          {error && <div className="invalid-feedback d-block">{error}</div>}
        </div>
      </div>

      <Form.Group controlId="coverUrl" className="mt-3">
        <Form.Label className="meta fw-normal">or use an image URL</Form.Label>
        <Form.Control size="sm" value={coverUrl} onChange={onCoverUrlChange} maxLength={500} placeholder="https://…" isInvalid={!!urlError} disabled={disabled} />
        {urlError && <div className="invalid-feedback d-block">{urlError}</div>}
      </Form.Group>

      <ConfirmModal
        show={confirmRemove}
        title="Remove the uploaded photo?"
        message="The book will show its library cover (from the ISBN) or its initials instead."
        confirmLabel="Remove photo"
        onConfirm={remove}
        onCancel={() => setConfirmRemove(false)}
        loading={removing}
      />
    </>
  );
}
