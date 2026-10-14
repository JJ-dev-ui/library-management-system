import { useEffect, useState } from 'react';

// Custom hook: returns `value` only after it stops changing for `delay` ms.
// Used for the search box, so we call the API once the user pauses typing, not on every keystroke.
export default function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer); // cancel the previous timer when value changes again
  }, [value, delay]);

  return debounced;
}
