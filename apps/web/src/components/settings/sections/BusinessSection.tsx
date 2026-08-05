import { useFormContext } from 'react-hook-form';
import type { SettingsSectionProps } from '@/components/settings/SettingsLayout';

/**
 * BusinessSection — scaffold.
 *
 * This is the section that drives tenant branding, so the colour input here
 * eventually feeds `useThemeInjection()` rather than any hard-coded value.
 *
 * TODO(DL-DESIGN-009): logo upload, primary-colour picker wired to
 * useThemeInjection with a live contrast warning, business hours editor,
 * Israeli business ID validated with `formatBusinessID`/`isValidBusinessID`.
 */
export function BusinessSection({ tenantId }: SettingsSectionProps) {
  const { register } = useFormContext();

  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="text-h4 mb-1 text-[var(--color-text-primary)]">Business</legend>
      <p className="text-body-sm text-[var(--color-text-secondary)]">
        Branding, opening hours and contact details for tenant{' '}
        <span className="numeric-cell">{tenantId}</span>.
      </p>

      <div className="space-y-2">
        <label
          htmlFor="business-name"
          className="text-body-sm block font-medium text-[var(--color-text-primary)]"
        >
          Business name
        </label>
        <input
          id="business-name"
          type="text"
          autoComplete="organization"
          className="form-control-base"
          {...register('businessName')}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="business-phone"
          className="text-body-sm block font-medium text-[var(--color-text-primary)]"
        >
          Contact phone
        </label>
        <input
          id="business-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          // Phone numbers stay LTR even in an RTL form — the Israeli convention.
          className="form-control-base"
          aria-describedby="business-phone-hint"
          {...register('businessPhone')}
        />
        <p id="business-phone-hint" className="text-caption text-[var(--color-text-secondary)]">
          Israeli format, e.g. 050-123-4567.
        </p>
      </div>
    </fieldset>
  );
}

export default BusinessSection;
