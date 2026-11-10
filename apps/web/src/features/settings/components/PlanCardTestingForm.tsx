import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { isDevSite } from '@/lib/devStudioPicker';
import { useTenant } from '@/hooks/useTenant';
import { functionInvokeErrorMessage, parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * Settings → Payments, dev website only (OpalSwift's own billing, step B2,
 * docs/plans/TAKBULL-INTEGRATION.md): the studio's card for its OpalSwift plan. "Add a card"
 * opens a Takbull page of OpalSwift's own account; the first month's charge saves the card
 * (₪1 on dev while no price is set). After the page, Takbull's notice settles it, so the
 * status is asked again for a short while.
 */
export function PlanCardTestingForm() {
  if (!isDevSite()) return null;
  return <PlanCard />;
}

type Subscription = {
  card_last4: string | null;
  card_expiry: string | null;
  next_charge_on: string | null;
  last_payment_status: string | null;
  last_payment_agorot: number | null;
};

function returnState(): 'done' | 'cancelled' | null {
  try {
    const v = new URLSearchParams(window.location.search).get('plan_card');
    return v === 'done' || v === 'cancelled' ? v : null;
  } catch {
    return null;
  }
}

function PlanCard() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [returned] = useState(returnState);
  // Back from Takbull: the notice may land a few seconds later, so ask again for up to a minute.
  const [polls, setPolls] = useState(returned === 'done' ? 12 : 0);

  const sub = useQuery({
    queryKey: ['my-studio-subscription', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase.rpc('my_studio_subscription');
      if (error) throw error;
      return ((data as Subscription[] | null) ?? [])[0] ?? null;
    },
    refetchInterval: polls > 0 ? 5000 : false,
  });

  const s = sub.data;
  const settled = s?.last_payment_status === 'succeeded' || s?.last_payment_status === 'failed';
  useEffect(() => {
    if (polls <= 0) return;
    if (settled) {
      setPolls(0);
      return;
    }
    const id = window.setTimeout(() => setPolls((n) => n - 1), 5000);
    return () => window.clearTimeout(id);
  }, [polls, settled]);

  const start = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('platform-billing-card', { body: {} });
      const body = await parseFunctionInvokeBody(data, error);
      if (body?.ok === true && typeof body.url === 'string') return body.url as string;
      if (body?.code === 'already_paid') throw new Error(t('settings.plan_card.already_paid'));
      if (body?.code === 'not_set_up') throw new Error(t('settings.plan_card.not_set_up'));
      throw new Error(functionInvokeErrorMessage(error, body, t('settings.plan_card.start_failed')));
    },
    onSuccess: (url) => {
      window.location.assign(url);
    },
    onError: (err: Error) => setMessage({ kind: 'error', text: err.message }),
  });

  const status = (() => {
    if (returned === 'cancelled') return t('settings.plan_card.cancelled');
    if (s?.last_payment_status === 'pending' && returned === 'done') return t('settings.plan_card.checking');
    if (s?.last_payment_status === 'failed' && returned === 'done') return t('settings.plan_card.failed');
    return null;
  })();

  return (
    <section className="space-y-4 max-w-lg" aria-labelledby="plan-card-title">
      <h2 id="plan-card-title" className="text-lg font-semibold text-foreground">{t('settings.plan_card.title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.plan_card.hint')}</p>
      <p className="text-sm" role="status">
        {s?.card_last4
          ? t('settings.plan_card.card_on_file', { last4: s.card_last4, expiry: s.card_expiry ?? '' })
          : s
            ? t('settings.plan_card.no_card')
            : null}
      </p>
      {s?.next_charge_on && (
        <p className="text-sm text-muted-foreground">
          {t('settings.plan_card.next_charge', { date: new Date(s.next_charge_on).toLocaleDateString() })}
        </p>
      )}
      {status && <p className="text-sm text-muted-foreground" role="status">{status}</p>}
      {message && (
        <p
          className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}
      <Button
        type="button"
        variant={s?.card_last4 ? 'outline' : 'primary'}
        disabled={start.isPending}
        isLoading={start.isPending}
        onClick={() => {
          setMessage(null);
          start.mutate();
        }}
      >
        {s?.card_last4 ? t('settings.plan_card.replace') : t('settings.plan_card.add')}
      </Button>
    </section>
  );
}
