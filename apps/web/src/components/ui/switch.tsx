import type { InputHTMLAttributes } from 'react';

/**
 * An on/off switch: a native checkbox with role="switch" (keyboard, screen readers and forms
 * work as usual), drawn as a sliding track. Label it with a <label htmlFor> or aria-label.
 */
export function Switch({
  checked,
  onCheckedChange,
  className = '',
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <span className={`relative inline-flex h-7 w-12 shrink-0 items-center ${className}`}>
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        {...rest}
      />
      <span
        aria-hidden="true"
        className="h-7 w-12 rounded-full bg-gray-300 transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-disabled:opacity-50"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute start-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5"
      />
    </span>
  );
}
