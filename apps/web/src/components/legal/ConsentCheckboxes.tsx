import { useId } from 'react';
import { consentWording, type ConsentKind, type ConsentState } from '@/legal/consents';
import type { LegalLang } from '@/legal/render';

export interface ConsentCheckboxesProps {
  legend: string;
  hint?: string;
  kinds: ConsentKind[];
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  lang: LegalLang;
  vars?: { student?: string; studio?: string };
  /** Shown above the options, e.g. the guardian declaration for a minor. */
  preface?: string;
  disabled?: boolean;
}

/** Optional consent checkboxes — never ticked by default, never a condition of service. */
export function ConsentCheckboxes({
  legend,
  hint,
  kinds,
  value,
  onChange,
  lang,
  vars,
  preface,
  disabled,
}: ConsentCheckboxesProps) {
  const baseId = useId();
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {preface && <p className="text-xs">{preface}</p>}
      {kinds.map((kind) => {
        const id = `${baseId}-${kind}`;
        return (
          <div key={kind} className="flex items-start gap-2">
            <input
              id={id}
              type="checkbox"
              className="mt-1"
              checked={value[kind] === true}
              onChange={(e) => onChange({ ...value, [kind]: e.target.checked })}
            />
            <label htmlFor={id} className="text-sm">
              {consentWording(kind, lang, vars)}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
