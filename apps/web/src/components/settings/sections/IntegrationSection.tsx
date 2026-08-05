import { useFormContext } from 'react-hook-form';
import type { SettingsSectionProps } from '@/components/settings/SettingsLayout';

/**
 * IntegrationSection — scaffold.
 *
 * TODO(DL-DESIGN-009): WhatsApp click-to-chat number (validated with
 * `isValidIsraeliPhone`), calendar sync (Google/ICS) with connection status,
 * webhook endpoints and secret rotation.
 */
export function IntegrationSection({ tenantId }: SettingsSectionProps) {
  const { register } = useFormContext();

  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="text-h4 mb-1 text-[var(--color-text-primary)]">Integrations</legend>
      <p className="text-body-sm text-[var(--color-text-secondary)]">
        WhatsApp, calendar sync and third-party services.
      </p>
      <input type="hidden" value={tenantId} {...register('tenantId')} />

      <div className="space-y-2">
        <label
          htmlFor="integration-whatsapp"
          className="text-body-sm block font-medium text-[var(--color-text-primary)]"
        >
          WhatsApp number
        </label>
        <input
          id="integration-whatsapp"
          type="tel"
          inputMode="tel"
          dir="ltr"
          className="form-control-base"
          aria-describedby="integration-whatsapp-hint"
          {...register('whatsappNumber')}
        />
        <p
          id="integration-whatsapp-hint"
          className="text-caption text-[var(--color-text-secondary)]"
        >
          Used by the WhatsApp contact button shown to clients.
        </p>
      </div>
    </fieldset>
  );
}

export default IntegrationSection;
