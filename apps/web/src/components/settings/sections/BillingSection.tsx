import { useFormContext } from 'react-hook-form';
import type { SettingsSectionProps } from '@/components/settings/SettingsLayout';

/**
 * BillingSection — scaffold.
 *
 * Card data must never reach this form or the draft store: the follow-up should
 * mount Stripe Elements (`@stripe/react-stripe-js`, already a dependency) so
 * the PAN stays inside Stripe's iframe. Only non-sensitive invoicing
 * preferences belong in the shared form.
 *
 * TODO(DL-DESIGN-009): payment-method list via Stripe Elements, invoice history
 * table (DataTable + `formatNIS`), VAT/business-ID capture, receipt language.
 */
export function BillingSection({ tenantId }: SettingsSectionProps) {
  const { register } = useFormContext();

  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="text-h4 mb-1 text-[var(--color-text-primary)]">Billing</legend>
      <p className="text-body-sm text-[var(--color-text-secondary)]">
        Payment methods and invoicing preferences.
      </p>
      <input type="hidden" value={tenantId} {...register('tenantId')} />

      <div className="space-y-2">
        <label
          htmlFor="billing-email"
          className="text-body-sm block font-medium text-[var(--color-text-primary)]"
        >
          Invoice email
        </label>
        <input
          id="billing-email"
          type="email"
          autoComplete="email"
          dir="ltr"
          className="form-control-base"
          {...register('invoiceEmail')}
        />
      </div>

      <p className="text-caption text-[var(--color-text-secondary)]">
        Card details are entered in a secure Stripe field and are never stored by
        this application.
      </p>
    </fieldset>
  );
}

export default BillingSection;
