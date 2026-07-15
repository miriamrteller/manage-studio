import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  BookingSettingsService,
  DEFAULT_BOOKING_SETTINGS,
  HOLD_EXPIRY_OPTIONS,
  EXPIRY_REMINDER_OPTIONS,
  type BookingSettings,
  type BookingHours,
} from '@/features/scheduling/bookingSettingsService';
import { GoogleCalendarSettings } from '@/features/scheduling/components/GoogleCalendarSettings';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LABELS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_LABELS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function BookingSettingsPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { hasFeature, isLoading: gateLoading } = useFeatureGate();
  const dayLabels = i18n.language === 'en' ? DAY_LABELS_EN : DAY_LABELS_HE;

  const [settings, setSettings] = useState<BookingSettings>(DEFAULT_BOOKING_SETTINGS);
  const [hours, setHours] = useState<BookingHours[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  const canManage = hasFeature(FEATURES.scheduling.adminBooking);

  const settingsQuery = useQuery({
    queryKey: ['bookingSettings', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const [s, h] = await Promise.all([
        BookingSettingsService.getSettings(tenant as never),
        BookingSettingsService.getHours(tenant as never),
      ]);
      return { s, h };
    },
    enabled: !!tenant?.id && canManage,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data.s);
      setHours(settingsQuery.data.h);
    }
  }, [settingsQuery.data]);

  function update<K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function addHours() {
    setHours((prev) => [...prev, { day_of_week: 0, start_time: '09:00', end_time: '17:00', is_active: true }]);
  }

  function updateHour(index: number, patch: Partial<BookingHours>) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  function removeHour(index: number) {
    setHours((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!tenant?.id) return;
    setSaving(true);
    setStatus(null);
    try {
      await BookingSettingsService.saveSettings(tenant as never, settings);
      await BookingSettingsService.saveHours(tenant as never, hours);
      setStatus({ kind: 'ok', msg: t('scheduling.booking.saved') });
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!gateLoading && !canManage) {
    return (
      <div className="max-w-3xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{t('scheduling.booking.settings_title')}</h1>
        <p className="text-gray-600">{t('scheduling.booking.not_available')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8 p-2">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('scheduling.booking.settings_title')}</h1>
        <p className="text-gray-600">{t('scheduling.booking.settings_subtitle')}</p>
      </header>

      {status && (
        <div
          className={`rounded-md border p-3 text-sm ${
            status.kind === 'ok'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.msg}
        </div>
      )}

      <section className="card border border-gray-200 space-y-4 p-4">
        {!settings.is_booking_enabled && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            {t('scheduling.booking.enable_required')}
          </div>
        )}
        <label className="flex items-center gap-2">
          <Checkbox
            checked={settings.is_booking_enabled}
            onCheckedChange={(c) => update('is_booking_enabled', c)}
          />
          <span className="font-medium">{t('scheduling.booking.enable')}</span>
        </label>
        <p className="text-sm text-gray-500">{t('scheduling.booking.enable_hint')}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('scheduling.booking.slot_duration')}>
            <Input
              type="number"
              min={5}
              value={settings.slot_duration_mins}
              onChange={(e) => update('slot_duration_mins', Number(e.target.value))}
            />
          </Field>
          <Field label={t('scheduling.booking.buffer')}>
            <Input
              type="number"
              min={0}
              value={settings.buffer_mins}
              onChange={(e) => update('buffer_mins', Number(e.target.value))}
            />
          </Field>
          <Field label={t('scheduling.booking.max_per_day')}>
            <Input
              type="number"
              min={0}
              value={settings.max_per_day ?? ''}
              onChange={(e) =>
                update('max_per_day', e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </Field>
          <Field label={t('scheduling.booking.advance_notice')}>
            <Input
              type="number"
              min={0}
              value={settings.advance_notice_hrs}
              onChange={(e) => update('advance_notice_hrs', Number(e.target.value))}
            />
          </Field>
          <Field label={t('scheduling.booking.booking_window')}>
            <Input
              type="number"
              min={1}
              value={settings.booking_window_days}
              onChange={(e) => update('booking_window_days', Number(e.target.value))}
            />
          </Field>
          <Field label={t('scheduling.booking.hold_expiry')}>
            <Select
              value={settings.hold_expiry_mins}
              onChange={(e) => update('hold_expiry_mins', Number(e.target.value))}
            >
              {HOLD_EXPIRY_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('scheduling.booking.expiry_reminder')}>
            <Select
              value={settings.expiry_reminder_mins ?? ''}
              onChange={(e) =>
                update('expiry_reminder_mins', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">{t('scheduling.booking.expiry_reminder_off')}</option>
              {EXPIRY_REMINDER_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="card border border-gray-200 space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('scheduling.booking.hours_title')}</h2>
          <Button variant="outline" size="sm" onClick={addHours}>
            {t('scheduling.booking.add_hours')}
          </Button>
        </div>
        <div className="space-y-3">
          {hours.map((h, i) => (
            <div key={h.id ?? i} className="flex flex-wrap items-end gap-3">
              <Field label={t('scheduling.booking.day_of_week')}>
                <Select
                  value={h.day_of_week}
                  onChange={(e) => updateHour(i, { day_of_week: Number(e.target.value) })}
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
                  onChange={(e) => updateHour(i, { start_time: e.target.value })}
                />
              </Field>
              <Field label={t('scheduling.booking.end_time')}>
                <Input
                  type="time"
                  value={h.end_time.slice(0, 5)}
                  onChange={(e) => updateHour(i, { end_time: e.target.value })}
                />
              </Field>
              <Button variant="ghost" size="sm" onClick={() => removeHour(i)} aria-label={t('common.remove')}>
                {t('common.remove')}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="card border border-gray-200 space-y-2 p-4">
        <h2 className="text-lg font-semibold">{t('scheduling.booking.manage_services')}</h2>
        <p className="text-sm text-gray-500">{t('scheduling.booking.manage_services_hint')}</p>
        <Link to="/admin/setup/services">
          <Button variant="outline" size="sm">
            {t('nav.booking_services')}
          </Button>
        </Link>
      </section>

      <div>
        <Button variant="primary" isLoading={saving} onClick={handleSave}>
          {t('scheduling.booking.save')}
        </Button>
      </div>

      <GoogleCalendarSettings />
    </div>
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
