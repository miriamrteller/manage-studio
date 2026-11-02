import { useId, useState, type ReactNode } from 'react';

/**
 * ⓘ help next to a setting: a button that shows a short explanation below it.
 * Keyboard and screen-reader friendly (aria-expanded / aria-controls); Escape closes.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="inline-block align-middle">
      <button
        type="button"
        className="ms-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs leading-none text-muted-foreground hover:text-foreground"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        i
      </button>
      {open && (
        <span id={id} role="note" className="mt-1 block max-w-prose rounded border bg-muted px-3 py-2 text-sm font-normal text-foreground">
          {children}
        </span>
      )}
    </span>
  );
}
