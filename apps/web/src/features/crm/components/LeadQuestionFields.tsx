import type { FormQuestion, LeadFormLang } from '@shared/index';

/**
 * The studio's extra questions on the enquiry form (ready-made + custom).
 * Values are kept as the form sends them: text, number, ISO date, option
 * value, or a list of option values.
 */
export function LeadQuestionFields({
  questions,
  values,
  invalid,
  lang,
  onChange,
  requiredHint,
  invalidHint,
}: {
  questions: FormQuestion[];
  values: Record<string, unknown>;
  invalid: string[];
  lang: LeadFormLang;
  onChange: (key: string, value: unknown) => void;
  requiredHint: string;
  invalidHint: string;
}) {
  if (questions.length === 0) return null;
  return (
    <>
      {questions.map((q) => {
        const id = `inquire-q-${q.key}`;
        const label = q.label[lang] || q.label.en;
        const bad = invalid.includes(q.key);
        const errorId = bad ? `${id}-error` : undefined;
        const common = {
          id,
          'aria-invalid': bad || undefined,
          'aria-describedby': errorId,
          required: q.required,
          className: 'w-full border rounded px-3 py-2',
        } as const;
        const value = values[q.key];
        const error = bad ? (
          <p id={errorId} className="text-xs text-destructive mt-1">
            {value === undefined || value === '' || (Array.isArray(value) && value.length === 0) ? requiredHint : invalidHint}
          </p>
        ) : null;

        if (q.type === 'multi_select') {
          const picked = Array.isArray(value) ? (value as string[]) : [];
          return (
            <fieldset key={q.key} aria-describedby={errorId} aria-invalid={bad || undefined}>
              <legend className="block text-sm font-medium mb-1">
                {label}
                {q.required && ' *'}
              </legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {q.options.map((o) => (
                  <label key={o.value} className="inline-flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.includes(o.value)}
                      onChange={(e) =>
                        onChange(q.key, e.target.checked ? [...picked, o.value] : picked.filter((v) => v !== o.value))
                      }
                    />
                    {o.label[lang] || o.label.en}
                  </label>
                ))}
              </div>
              {error}
            </fieldset>
          );
        }

        return (
          <div key={q.key}>
            <label htmlFor={id} className="block text-sm font-medium mb-1">
              {label}
              {q.required && ' *'}
            </label>
            {q.type === 'long_text' ? (
              <textarea {...common} rows={3} maxLength={1000} value={String(value ?? '')} onChange={(e) => onChange(q.key, e.target.value)} />
            ) : q.type === 'select' ? (
              <select {...common} value={String(value ?? '')} onChange={(e) => onChange(q.key, e.target.value)}>
                <option value="">—</option>
                {q.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label[lang] || o.label.en}
                  </option>
                ))}
              </select>
            ) : q.type === 'number' ? (
              <input
                {...common}
                type="number"
                inputMode="numeric"
                min={q.min}
                max={q.max}
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) => onChange(q.key, e.target.value === '' ? '' : Number(e.target.value))}
              />
            ) : q.type === 'date' ? (
              <input {...common} type="date" value={String(value ?? '')} onChange={(e) => onChange(q.key, e.target.value)} />
            ) : (
              <input {...common} maxLength={200} value={String(value ?? '')} onChange={(e) => onChange(q.key, e.target.value)} />
            )}
            {error}
          </div>
        );
      })}
    </>
  );
}
