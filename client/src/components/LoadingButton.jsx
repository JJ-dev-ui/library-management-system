import { Button, Spinner } from 'react-bootstrap';

// Button that shows a spinner + "busy" text while an action runs.
// Both labels are always rendered in the same grid cell (one is invisible), so the
// button keeps a fixed width and nothing around it moves when loading starts.
export default function LoadingButton({ loading = false, loadingText, children, disabled, ...rest }) {
  return (
    <Button {...rest} disabled={loading || disabled} aria-busy={loading || undefined}>
      <span className="btn-loading-stack">
        <span className={loading ? 'is-hidden' : ''}>{children}</span>
        <span className={loading ? '' : 'is-hidden'} aria-hidden={!loading}>
          <Spinner animation="border" size="sm" aria-hidden="true" />
          {loadingText}
        </span>
      </span>
    </Button>
  );
}
