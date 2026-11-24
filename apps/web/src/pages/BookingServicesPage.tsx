import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useHasFeature } from '@/hooks/useHasFeature';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import {
  PRICE_DISPLAYS,
  ServicesService,
  safePriceDisplay,
  type AppointmentService,
  type PriceDisplay,
} from '@/features/scheduling/servicesService';
import { formatPackagePrice } from '@/lib/formatPackagePrice';
import { useWorkModes } from '@/hooks/useWorkModes';
import { usePhotoShopEnabled } from '@/features/jobs/hooks/usePhotoShop';

interface ServiceFormState {
  id: string | null;
  name: string;
  duration_mins: number;
  price_major: number;
  currency: string;
  location: string;
  is_public: boolean;
  photos_included: number;
  online_booking: boolean;
  price_display: PriceDisplay;
  deposit_percent: number;
}

/** The deposit quotes use unless a package says otherwise (quoteDraft's default). */
const USUAL_DEPOSIT_PERCENT = 30;

const EMPTY_FORM: ServiceFormState = {
  id: null,
  name: '',
  duration_mins: 60,
  price_major: 0,
  currency: 'ILS',
  location: '',
  is_public: true,
  photos_included: 0,
  online_booking: true,
  price_display: 'show',
  deposit_percent: USUAL_DEPOSIT_PERCENT,
};

export default function BookingServicesPage() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const { hasAnyFeature, isLoading: gateLoading } = useHasFeature();
  // The same check as the Packages tab (navigationConfig): Projects or Appointments.
  const canManage = hasAnyFeature([FEATURES.billing.quotes, FEATURES.scheduling.adminBooking]);
  const { labels } = useEntityLabels();
  const itemWord = i18n.language === 'en' ? labels.offering.singular.toLowerCase() : labels.offering.singular;
  const photoShop = usePhotoShopEnabled();
  // Deposits belong to quotes (Projects). The online switch only matters for instant booking,
  // which the Book page uses when the studio takes Appointments and not Projects (shoot requests).
  const { projects, appointments } = useWorkModes();
  const instantBooking = appointments && !projects;

  const [form, setForm] = useState<ServiceFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null);

  const servicesQuery = useQuery({
    queryKey: ['appointmentServices', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      return ServicesService.list(tenant as never);
    },
    enabled: !!tenant?.id && canManage,
  });

  function startAdd() {
    setStatus(null);
    setForm({ ...EMPTY_FORM, currency: tenant?.currency || EMPTY_FORM.currency });
  }

  function startEdit(svc: AppointmentService) {
    setStatus(null);
    setForm({
      id: svc.id,
      name: svc.name,
      duration_mins: svc.duration_mins || 60,
      price_major: svc.price_minor / 100,
      currency: svc.currency,
      location: svc.location ?? '',
      is_public: svc.is_public,
      photos_included: svc.photos_included,
      online_booking: svc.online_booking,
      price_display: svc.price_display,
      deposit_percent: svc.deposit_percent ?? USUAL_DEPOSIT_PERCENT,
    });
  }

  function patchForm(patch: Partial<ServiceFormState>) {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleSave() {
    if (!tenant?.id || !form) return;
    setSaving(true);
    setStatus(null);
    try {
      const input = {
        name: form.name.trim(),
        duration_mins: form.duration_mins,
        price_minor: Math.round(form.price_major * 100),
        currency: form.currency,
        location: form.location.trim() || null,
        is_public: form.is_public,
        price_display: form.price_display,
        ...(instantBooking ? { online_booking: form.online_booking } : {}),
        ...(projects
          ? { deposit_percent: Math.min(100, Math.max(0, Math.round(form.deposit_percent || 0))) }
          : {}),
        ...(photoShop ? { photos_included: Math.max(0, Math.floor(form.photos_included || 0)) } : {}),
      };
      if (form.id) {
        await ServicesService.update(tenant as never, form.id, input);
      } else {
        await ServicesService.create(tenant as never, input);
      }
      setForm(null);
      setStatus({ kind: 'ok', msg: t('scheduling.services.saved') });
      await servicesQuery.refetch();
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id: string) {
    if (!tenant?.id) return;
    if (!window.confirm(t('scheduling.services.remove_confirm'))) return;
    try {
      await ServicesService.remove(tenant as never, id);
      setStatus({ kind: 'ok', msg: t('scheduling.services.removed') });
      await servicesQuery.refetch();
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!gateLoading && !canManage) {
    // Reached only by an old link: the Packages tab is hidden for this studio.
    return (
      <div className="max-w-3xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{labels.offering.plural}</h1>
        <p className="text-gray-600">{t('scheduling.diary.not_used')}</p>
      </div>
    );
  }

  const services = servicesQuery.data ?? [];

  return (
    <div className="max-w-3xl space-y-6 p-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">{labels.offering.plural}</h1>
          <p className="text-gray-600">{t('scheduling.services.packages_subtitle')}</p>
        </div>
        {!form && (
          <Button variant="primary" onClick={startAdd}>
            {t('scheduling.services.add_named', { item: itemWord })}
          </Button>
        )}
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

      <section className="space-y-3">
        {services.length === 0 && !servicesQuery.isLoading && (
          <p className="text-gray-500">{t('scheduling.services.none_named', { item: itemWord })}</p>
        )}
        {services.map((svc) => (
          <div
            key={svc.id}
            className="card flex items-center justify-between gap-3 border border-gray-200 p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{svc.name}</p>
              <p className="text-sm text-gray-500">
                {[
                  `${svc.duration_mins} ${t('scheduling.services.duration_suffix')}`,
                  formatPackagePrice(t, svc.price_minor, svc.price_display, svc.currency || 'ILS', i18n.language),
                  projects && svc.deposit_percent !== null
                    ? t('scheduling.services.deposit_list', { percent: svc.deposit_percent })
                    : null,
                  instantBooking && (!svc.online_booking || svc.price_display === 'on_request')
                    ? t('scheduling.services.enquiry_only')
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => startEdit(svc)}>
                {t('common.edit')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleRemove(svc.id)}>
                {t('scheduling.services.remove')}
              </Button>
            </div>
          </div>
        ))}
      </section>

      {form ? (
        <section className="card space-y-4 border border-gray-200 p-4">
          <h2 className="text-lg font-semibold">
            {form.id ? t('scheduling.services.edit_named', { item: itemWord }) : t('scheduling.services.add_named', { item: itemWord })}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('scheduling.services.name')}>
              <Input value={form.name} onChange={(e) => patchForm({ name: e.target.value })} />
            </Field>
            <Field label={t('scheduling.services.price')}>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price_major}
                onChange={(e) => patchForm({ price_major: Number(e.target.value) })}
              />
            </Field>
            {projects && (
              <Field label={t('scheduling.services.deposit_percent')} hint={t('scheduling.services.deposit_percent_hint')}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  value={form.deposit_percent}
                  onChange={(e) => patchForm({ deposit_percent: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label={t('scheduling.services.duration')}>
              <Input
                type="number"
                min={5}
                value={form.duration_mins}
                onChange={(e) => patchForm({ duration_mins: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('scheduling.services.price_display')}>
              <Select
                value={form.price_display}
                onChange={(e) => patchForm({ price_display: safePriceDisplay(e.target.value) })}
              >
                {PRICE_DISPLAYS.map((d) => (
                  <option key={d} value={d}>
                    {t(`scheduling.price_display.${d}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {instantBooking && (
            <div className="space-y-1">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={form.online_booking}
                  onCheckedChange={(c) => patchForm({ online_booking: Boolean(c) })}
                />
                <span className="text-sm font-medium">{t('scheduling.services.online_booking')}</span>
              </label>
              <p className="text-sm text-gray-500">{t('scheduling.services.online_booking_hint')}</p>
            </div>
          )}
          <details className="rounded-md border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('studio_setup.filled_for_you')}</summary>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('scheduling.services.location')}>
                <Input
                  value={form.location}
                  onChange={(e) => patchForm({ location: e.target.value })}
                />
              </Field>
              {photoShop && (
                <Field label={t('scheduling.services.photos_included')}>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.photos_included}
                    onChange={(e) => patchForm({ photos_included: Number(e.target.value) })}
                  />
                </Field>
              )}
            </div>
            <label className="mt-3 flex items-center gap-2">
              <Checkbox
                checked={form.is_public}
                onCheckedChange={(c) => patchForm({ is_public: Boolean(c) })}
              />
              <span className="text-sm font-medium">{t('scheduling.services.is_public')}</span>
            </label>
          </details>
          <div className="flex gap-2">
            <Button
              variant="primary"
              isLoading={saving}
              disabled={!form.name.trim() || form.duration_mins <= 0}
              onClick={handleSave}
            >
              {t('scheduling.services.save')}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)}>
              {t('scheduling.services.cancel')}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}
