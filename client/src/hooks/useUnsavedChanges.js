import { useEffect } from 'react';

// While `dirty` is true, closing the tab, refreshing or typing another address shows the browser's
// own "Leave site? Changes you made may not be saved" prompt (the text cannot be customised).
// Note: links inside the app are handled by the forms themselves (Cancel asks for confirmation).
export default function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = ''; // needed by some browsers to show the prompt
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}
