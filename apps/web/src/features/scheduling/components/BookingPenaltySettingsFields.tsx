import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { BookingSettings } from '@/features/scheduling/bookingSettingsService';

interface Props {
  settings: BookingSettings;
  onUpdate: <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => void;
}

export function BookingPenaltySettingsFields({ settings, onUpdate }: Props) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('scheduling.booking.late_cancel_hours')}>
        <Input
          type="number"
          min={0}
          value={settings.late_cancel_hours}
          onChange={(e) => onUpdate('late_cancel_hours', Number(e.target.value))}
        />
      </Field>
      <label className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          checked={settings.retain_payment_on_penalty}
          onCheckedChange={(c) => onUpdate('retain_payment_on_penalty', c)}
        />
        <span className="text-sm font-medium text-gray-700">
          {t('scheduling.booking.retain_payment_on_penalty')}
        </span>
      </label>
      <p className="text-sm text-gray-500 sm:col-span-2">{t('scheduling.booking.penalties_hint')}</p>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
