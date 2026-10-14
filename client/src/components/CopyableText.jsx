import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { copyText } from '../utils/clipboard';

// Click-to-copy text (ISBNs, transaction codes). Shows a toast "<value> copied" and a check mark for 2s.
// label: what the value is, for screen readers ("ISBN", "Transaction code").
// stopPropagation: the click/Enter must NOT also open the table row or card it sits in.
export default function CopyableText({ value, label = '', className = '' }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []); // clean up if the component disappears

  if (!value) return <span className={className}>—</span>;

  const copy = async (e) => {
    e.stopPropagation();
    if (await copyText(value)) {
      toast.success(`${value} copied`);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  };

  return (
    <button
      type="button"
      className={`copy-chip mono ${copied ? 'is-copied' : ''} ${className}`}
      onClick={copy}
      onKeyDown={(e) => e.stopPropagation()}
      title={`Copy ${label || value}`}
      aria-label={`Copy ${label ? `${label} ` : ''}${value}`}
    >
      {value}
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}
