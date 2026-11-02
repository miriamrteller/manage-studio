import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ProviderSwitchImpact {
  /** Card payments started with the old provider and not confirmed yet. */
  pendingCharges: number;
  /** Saved cards (tokens) that belong to the old provider. */
  savedCards: number;
  /** Active monthly plans; from now on they are charged through the new provider. */
  activeSchedules: number;
}

export function switchNeedsConfirmation(impact: ProviderSwitchImpact | undefined): boolean {
  return Boolean(impact && (impact.pendingCharges > 0 || impact.savedCards > 0 || impact.activeSchedules > 0));
}

/** Counts only (head requests); nothing is changed or deleted. Tenant admins can read these rows. */
export async function fetchProviderSwitchImpact(
  tenantId: string,
  oldProvider: string,
): Promise<ProviderSwitchImpact> {
  const [pending, cards, schedules] = await Promise.all([
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('provider', oldProvider)
      .eq('status', 'pending'),
    supabase
      .from('payment_method_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('provider', oldProvider)
      .is('revoked_at', null),
    supabase
      .from('billing_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
  ]);
  for (const r of [pending, cards, schedules]) if (r.error) throw r.error;
  return {
    pendingCharges: pending.count ?? 0,
    savedCards: cards.count ?? 0,
    activeSchedules: schedules.count ?? 0,
  };
}

/**
 * Shown in Settings → How customers pay when the admin is about to move from one online
 * provider to another (payments audit P2 #13). Says what still depends on the old provider;
 * the old provider's details are never deleted, so past payments can still be refunded.
 */
export function ProviderSwitchWarning({
  tenantId,
  oldProvider,
  newProvider,
  confirmed,
  onConfirmedChange,
}: {
  tenantId: string;
  oldProvider: string;
  newProvider: string;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
}) {
  const { t } = useTranslation();
  const impact = useQuery({
    queryKey: ['provider-switch-impact', tenantId, oldProvider],
    queryFn: () => fetchProviderSwitchImpact(tenantId, oldProvider),
  });
  const names = {
    old: t(`settings.provider_names.${oldProvider}`, { defaultValue: oldProvider }),
    new: t(`settings.provider_names.${newProvider}`, { defaultValue: newProvider }),
  };
  const data = impact.data;

  return (
    <section
      className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      aria-labelledby="provider-switch-title"
      aria-live="polite"
    >
      <h3 id="provider-switch-title" className="font-semibold">
        {t('settings.provider_switch.title', names)}
      </h3>
      {impact.isLoading && <p>{t('common.loading')}</p>}
      {impact.error && <p role="alert">{t('settings.provider_switch.check_failed')}</p>}
      {data && (
        <ul className="list-disc space-y-1 ps-5">
          {data.pendingCharges > 0 && (
            <li>{t('settings.provider_switch.pending_charges', { ...names, count: data.pendingCharges })}</li>
          )}
          {data.savedCards > 0 && (
            <li>{t('settings.provider_switch.saved_cards', { ...names, count: data.savedCards })}</li>
          )}
          {data.activeSchedules > 0 && (
            <li>{t('settings.provider_switch.active_schedules', { ...names, count: data.activeSchedules })}</li>
          )}
          <li>{t('settings.provider_switch.details_kept', names)}</li>
        </ul>
      )}
      {switchNeedsConfirmation(data) && (
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(e) => onConfirmedChange(e.target.checked)}
          />
          <span>{t('settings.provider_switch.confirm', names)}</span>
        </label>
      )}
    </section>
  );
}
