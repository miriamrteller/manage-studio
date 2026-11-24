import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/alert';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

/**
 * For a studio admin whose monthly OpalSwift plan charge was declined (step B3 of OpalSwift's
 * own billing). Information only: the studio keeps working, and the banner can be closed.
 * It shows nothing for studios without a saved card or a failed charge.
 */
const DISMISS_KEY = 'plan-payment-banner-dismissed';

function dismissedFor(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function PlanPaymentBanner() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [dismissed, setDismissed] = useState(dismissedFor);
  const sub = useQuery({
    queryKey: ['my-studio-subscription', tenant?.id],
    enabled: !!tenant?.id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_studio_subscription');
      if (error) throw error;
      return ((data as Array<{ failed_attempts: number; next_charge_on: string | null; last_failed_at?: string | null }> | null) ?? [])[0] ?? null;
    },
  });
  const s = sub.data;
  if (!s || !(s.failed_attempts > 0)) return null;
  // A new decline shows the banner again, even after it was closed.
  const key = `${s.failed_attempts}:${s.next_charge_on ?? ''}`;
  if (dismissed === key) return null;

  const offsets = [0, 3, 7];
  const offset = offsets[s.failed_attempts];
  const retryOn = offset !== undefined && s.next_charge_on
    ? new Date(Date.parse(`${s.next_charge_on}T00:00:00Z`) + offset * 86_400_000)
    : null;

  return (
    <Alert
      variant="warning"
      role="note"
      className="mb-4"
      dismissLabel={t('plan_banner.dismiss')}
      onDismiss={() => {
        try {
          window.sessionStorage.setItem(DISMISS_KEY, key);
        } catch {
          // Private mode: it just closes for now.
        }
        setDismissed(key);
      }}
    >
      <p className="text-sm">
        <strong className="font-semibold">{t('plan_banner.declined')}</strong>{' '}
        {retryOn
          ? t('plan_banner.retry_on', { date: retryOn.toLocaleDateString(undefined, { timeZone: 'UTC' }) })
          : t('plan_banner.no_more_retries')}{' '}
        {t('plan_banner.keeps_working')}{' '}
        <Link to="/admin/settings/payments" className="font-medium underline">{t('plan_banner.update_card')}</Link>
      </p>
    </Alert>
  );
}
