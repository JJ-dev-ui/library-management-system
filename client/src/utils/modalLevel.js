// Props that put a react-bootstrap Modal on a higher layer, so it can open ON TOP of another modal.
// level 0 = normal, 1 = above a modal, 2 = above two modals (classes defined in index.css).
export const levelProps = (level = 0) => (level > 0
  ? { className: `modal-level-${level}`, backdropClassName: `modal-backdrop-level-${level}` }
  : {});
