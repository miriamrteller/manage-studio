import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ServicesService,
  type AppointmentService,
} from '@/features/scheduling/servicesService';

interface ServiceFormState {
  id: string | null;
  name: string;
  duration_mins: number;
  price_major: number;
  currency: string;
  location: string;
  is_public: boolean;
}

const EMPTY_FORM: ServiceFormState = {
  id: null,
  name: '',
  duration_mins: 60,
  price_major: 0,
  currency: 'ILS',
  location: '',
  is_public: true,
};

export default function BookingServicesPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { hasFeature, isLoading: gateLoading } = useFeatureGate();
  const canManage = hasFeature(FEATURES.scheduling.adminBooking);

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
    setForm({ ...EMPTY_FORM });
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
    return (
      <div className="max-w-3xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{t('scheduling.services.title')}</h1>
        <p className="text-gray-600">{t('scheduling.services.not_available')}</p>
      </div>
    );
  }

  const services = servicesQuery.data ?? [];

  return (
    <div className="max-w-3xl space-y-6 p-2">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('scheduling.services.title')}</h1>
        <p className="text-gray-600">{t('scheduling.services.subtitle')}</p>
        <p className="text-sm text-gray-500">
          {t('scheduling.services.settings_hint')}{' '}
          <Link to="/admin/setup/booking" className="text-primary-600 underline">
            {t('nav.booking_settings')}
          </Link>
        </p>
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
          <p className="text-gray-500">{t('scheduling.services.none')}</p>
        )}
        {services.map((svc) => (
          <div
            key={svc.id}
            className="card flex items-center justify-between gap-3 border border-gray-200 p-4"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{svc.name}</p>
              <p className="text-sm text-gray-500">
                {svc.duration_mins} {t('scheduling.services.duration_suffix')} ·{' '}
                {(svc.price_minor / 100).toLocaleString(undefined, {
                  style: 'currency',
                  currency: svc.currency || 'ILS',
                })}
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
            {form.id ? t('scheduling.services.edit') : t('scheduling.services.add')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('scheduling.services.name')}>
              <Input value={form.name} onChange={(e) => patchForm({ name: e.target.value })} />
            </Field>
            <Field label={t('scheduling.services.duration')}>
              <Input
                type="number"
                min={5}
                value={form.duration_mins}
                onChange={(e) => patchForm({ duration_mins: Number(e.target.value) })}
              />
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
            <Field label={t('scheduling.services.location')}>
              <Input
                value={form.location}
                onChange={(e) => patchForm({ location: e.target.value })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={form.is_public}
              onCheckedChange={(c) => patchForm({ is_public: Boolean(c) })}
            />
            <span className="text-sm font-medium">{t('scheduling.services.is_public')}</span>
          </label>
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
      ) : (
        <Button variant="primary" onClick={startAdd}>
          {t('scheduling.services.add')}
        </Button>
      )}
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
