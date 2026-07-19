import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { BookingHours } from '@/features/scheduling/bookingSettingsService';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface Props {
  hours: BookingHours[];
  dayLabels: string[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<BookingHours>) => void;
  onRemove: (index: number) => void;
}

export function BookingHoursEditor({ hours, dayLabels, onAdd, onUpdate, onRemove }: Props) {
  const { t } = useTranslation();
  return (
    <section className="card space-y-4 border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('scheduling.booking.hours_title')}</h2>
        <Button variant="outline" size="sm" onClick={onAdd}>
          {t('scheduling.booking.add_hours')}
        </Button>
      </div>
      <div className="space-y-3">
        {hours.map((h, i) => (
          <div key={h.id ?? i} className="flex flex-wrap items-end gap-3">
            <Field label={t('scheduling.booking.day_of_week')}>
              <Select
                value={h.day_of_week}
                onChange={(e) => onUpdate(i, { day_of_week: Number(e.target.value) })}
              >
                {DAY_KEYS.map((_, idx) => (
                  <option key={idx} value={idx}>
                    {dayLabels[idx]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('scheduling.booking.start_time')}>
              <Input
                type="time"
                value={h.start_time.slice(0, 5)}
                onChange={(e) => onUpdate(i, { start_time: e.target.value })}
              />
            </Field>
            <Field label={t('scheduling.booking.end_time')}>
              <Input
                type="time"
                value={h.end_time.slice(0, 5)}
                onChange={(e) => onUpdate(i, { end_time: e.target.value })}
              />
            </Field>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(i)}
              aria-label={t('common.remove')}
            >
              {t('common.remove')}
            </Button>
          </div>
        ))}
      </div>
    </section>
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
