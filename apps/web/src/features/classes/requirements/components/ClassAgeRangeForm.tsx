import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * Age range for a class. Age is NOT a requirement: it is stored as min_age / max_age on
 * the class itself (see requirements/service.ts and the requirements migration), so this
 * form saves through the class update path and never creates a requirement row.
 */

export interface AgeRange {
  min_age: number | null;
  max_age: number | null;
}

interface ClassAgeRangeFormProps {
  minAge?: number | null;
  maxAge?: number | null;
  isSaving: boolean;
  /** Saves to the class; calls back on success or failure. */
  onSave: (range: AgeRange, callbacks: { onSuccess: () => void; onError: (error: Error) => void }) => void;
}

/** '' -> null; whole numbers 0 or more -> number; anything else -> 'invalid'. */
export function parseAge(raw: string): number | null | 'invalid' {
  const v = raw.trim();
  if (v === '') return null;
  return /^\d{1,3}$/.test(v) ? Number(v) : 'invalid';
}

export function ClassAgeRangeForm({ minAge = null, maxAge = null, isSaving, onSave }: ClassAgeRangeFormProps) {
  const { t } = useTranslation();
  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState<AgeRange>({ min_age: minAge, max_age: maxAge });
  const [min, setMin] = useState(minAge == null ? '' : String(minAge));
  const [max, setMax] = useState(maxAge == null ? '' : String(maxAge));
  const [errors, setErrors] = useState<{ min?: string; max?: string; order?: string; save?: string }>({});
  const [saved, setSaved] = useState(false);

  // Follow the class if its ages change underneath us (e.g. edited in the class form).
  useEffect(() => {
    setCurrent({ min_age: minAge, max_age: maxAge });
  }, [minAge, maxAge]);

  const currentText =
    current.min_age != null && current.max_age != null
      ? t('form.requirement.age_current_range', { min: current.min_age, max: current.max_age })
      : current.min_age != null
        ? t('form.requirement.age_current_min', { min: current.min_age })
        : current.max_age != null
          ? t('form.requirement.age_current_max', { max: current.max_age })
          : t('form.requirement.age_current_none');

  const handleSave = () => {
    setSaved(false);
    const minValue = parseAge(min);
    const maxValue = parseAge(max);
    const next: typeof errors = {};
    if (minValue === 'invalid') next.min = t('form.requirement.age_min_invalid');
    if (maxValue === 'invalid') next.max = t('form.requirement.age_max_invalid');
    if (typeof minValue === 'number' && typeof maxValue === 'number' && minValue > maxValue) {
      next.order = t('form.requirement.age_order_invalid');
    }
    setErrors(next);
    if (next.min) return minRef.current?.focus();
    if (next.max || next.order) return maxRef.current?.focus();

    const range: AgeRange = { min_age: minValue as number | null, max_age: maxValue as number | null };
    onSave(range, {
      onSuccess: () => {
        setCurrent(range);
        setSaved(true);
      },
      onError: (error) => setErrors({ save: error.message || t('form.requirement.age_save_failed') }),
    });
  };

  const maxError = errors.max ?? errors.order;

  return (
    <div
      className="space-y-2 rounded-md border p-3"
      style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-subtle, #f9fafb)' }}
    >
      <p className="text-sm" data-testid="age-current" style={{ color: 'var(--color-text-secondary)' }}>
        {currentText}
      </p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{t('form.requirement.age_hint')}</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="class-age-min" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            {t('form.requirement.min_age')}
          </label>
          <input
            id="class-age-min"
            ref={minRef}
            type="text"
            inputMode="numeric"
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border-default)' }}
            value={min}
            aria-invalid={errors.min ? true : undefined}
            aria-describedby={errors.min ? 'class-age-min-error' : undefined}
            onChange={(e) => { setMin(e.target.value); setSaved(false); }}
          />
          {errors.min && (
            <p id="class-age-min-error" role="alert" className="mt-1 text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {errors.min}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="class-age-max" className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            {t('form.requirement.max_age')}
          </label>
          <input
            id="class-age-max"
            ref={maxRef}
            type="text"
            inputMode="numeric"
            className="w-full rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border-default)' }}
            value={max}
            aria-invalid={maxError ? true : undefined}
            aria-describedby={maxError ? 'class-age-max-error' : undefined}
            onChange={(e) => { setMax(e.target.value); setSaved(false); }}
          />
          {maxError && (
            <p id="class-age-max-error" role="alert" className="mt-1 text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {maxError}
            </p>
          )}
        </div>
      </div>

      {errors.save && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>{errors.save}</p>
      )}
      {saved && (
        <p role="status" className="text-sm" style={{ color: 'var(--color-success, #15803d)' }}>
          {t('form.requirement.age_saved')}
        </p>
      )}

      <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
        {isSaving ? t('common.loading') : t('form.requirement.age_save')}
      </Button>
    </div>
  );
}
