import { useFormContext } from 'react-hook-form';
import type { SettingsSectionProps } from '@/components/settings/SettingsLayout';

/**
 * SecuritySection — scaffold.
 *
 * Note for the follow-up: a password change must NOT flow through the shared
 * draft autosave, because that would put a plaintext secret in localStorage.
 * When this section is built out it should own local state and call `onSave`
 * directly, opting out of the host form for the credential fields.
 *
 * TODO(DL-DESIGN-009): current/new password with strength meter, TOTP
 * enrolment, active session list with revoke, recovery codes.
 */
export function SecuritySection({ tenantId }: SettingsSectionProps) {
  const { register } = useFormContext();

  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="text-h4 mb-1 text-[var(--color-text-primary)]">Security</legend>
      <p className="text-body-sm text-[var(--color-text-secondary)]">
        Password and two-factor authentication.
      </p>
      <input type="hidden" value={tenantId} {...register('tenantId')} />

      <label
        htmlFor="security-2fa"
        className="text-body-sm flex items-center gap-2 text-[var(--color-text-primary)]"
      >
        <input
          id="security-2fa"
          type="checkbox"
          className="accent-[var(--color-primary)]"
          {...register('twoFactorEnabled')}
        />
        Require two-factor authentication
      </label>

      <p className="text-caption text-[var(--color-text-secondary)]">
        Password changes are handled in a dedicated flow and are never stored as
        a local draft.
      </p>
    </fieldset>
  );
}

export default SecuritySection;
