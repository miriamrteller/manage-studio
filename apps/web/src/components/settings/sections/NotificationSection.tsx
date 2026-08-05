import { useFormContext } from 'react-hook-form';
import type { SettingsSectionProps } from '@/components/settings/SettingsLayout';

/**
 * NotificationSection — scaffold.
 *
 * A `<fieldset>` inside SettingsPage's form; state comes from the shared
 * react-hook-form context.
 *
 * The channel toggles are grouped in a nested fieldset so screen readers
 * announce "Channels" before each checkbox — a bare list of checkboxes gives no
 * clue what they belong to.
 *
 * TODO(DL-DESIGN-009): per-event matrix (booking created / cancelled /
 * reminder), quiet hours, digest frequency.
 */
export function NotificationSection({ tenantId }: SettingsSectionProps) {
  const { register } = useFormContext();

  return (
    <fieldset className="space-y-4 border-0 p-0">
      <legend className="text-h4 mb-1 text-[var(--color-text-primary)]">Notifications</legend>
      <p className="text-body-sm text-[var(--color-text-secondary)]">
        Choose how you want to be told about activity.
      </p>
      <input type="hidden" value={tenantId} {...register('tenantId')} />

      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-body-sm mb-1 font-medium text-[var(--color-text-primary)]">
          Channels
        </legend>

        {(
          [
            { key: 'notifyEmail', label: 'Email' },
            { key: 'notifySms', label: 'SMS' },
            { key: 'notifyInApp', label: 'In-app' },
          ] as const
        ).map(({ key, label }) => (
          <label
            key={key}
            htmlFor={`notify-${key}`}
            className="text-body-sm flex items-center gap-2 text-[var(--color-text-primary)]"
          >
            <input
              id={`notify-${key}`}
              type="checkbox"
              className="accent-[var(--color-primary)]"
              {...register(key)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </fieldset>
  );
}

export default NotificationSection;
