import { useFormContext } from 'react-hook-form';
import type { SettingsSectionProps } from '@/components/settings/SettingsLayout';

/**
 * ProfileSection — scaffold.
 *
 * Renders a `<fieldset>`, never a `<form>`: SettingsPage owns the form element
 * and the react-hook-form instance, so fields are reached through
 * `useFormContext()` and the shared Save button submits them.
 *
 * TODO(DL-DESIGN-009): avatar upload, display-name validation, locale +
 * timezone pickers, zod schema.
 */
export function ProfileSection({ tenantId }: SettingsSectionProps) {
  const { register } = useFormContext();

  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="text-h4 mb-1 text-[var(--color-text-primary)]">Profile</legend>
      <p className="text-body-sm text-[var(--color-text-secondary)]">
        Your name, avatar and display preferences.
      </p>

      <div className="space-y-2">
        <label
          htmlFor="profile-display-name"
          className="text-body-sm block font-medium text-[var(--color-text-primary)]"
        >
          Display name
        </label>
        <input
          id="profile-display-name"
          type="text"
          autoComplete="name"
          className="form-control-base"
          {...register('displayName')}
        />
      </div>

      <p className="text-caption text-[var(--color-text-secondary)]">
        Tenant: <span className="numeric-cell">{tenantId}</span>
      </p>
    </fieldset>
  );
}

export default ProfileSection;
