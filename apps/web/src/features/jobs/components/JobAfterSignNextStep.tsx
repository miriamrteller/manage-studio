import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { fetchJobNextStep, type JobNextStep } from '../services/jobNextStepService';
import { BackToPortalButton } from './BackToPortalButton';

/** Seconds before the automatic move to the deposit payment page. */
export const AUTO_REDIRECT_SECONDS = 3;

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; step: JobNextStep };

/**
 * Shown on /enrol/complete after a JOB contract is signed (or was already
 * signed): continue to the unpaid deposit, or to the client portal when the
 * deposit is paid or there is none. Dance waivers never render this.
 *
 * The deposit page opens by itself after a few seconds; the move is
 * announced to screen readers and "Stay on this page" cancels it.
 */
export function JobAfterSignNextStep({
  engagementId,
  waiverToken,
  fallback,
}: {
  engagementId: string;
  waiverToken: string;
  /** Rendered when the next step cannot be loaded (today's dashboard button). */
  fallback: ReactNode;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [autoRedirect, setAutoRedirect] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchJobNextStep(engagementId, waiverToken)
      .then((step) => { if (!cancelled) setState({ kind: 'ready', step }); })
      .catch((err: unknown) => {
        console.warn('[JobAfterSignNextStep] next step unavailable:', err);
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => { cancelled = true; };
  }, [engagementId, waiverToken]);

  const payPath = state.kind === 'ready' && state.step.next === 'pay_deposit' ? state.step.payPath : null;
  useEffect(() => {
    if (!payPath || !autoRedirect) return;
    const timer = window.setTimeout(() => navigate(payPath), AUTO_REDIRECT_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [payPath, autoRedirect, navigate]);

  if (state.kind === 'loading') return <p role="status" className="text-gray-600">{t('common.loading')}</p>;
  if (state.kind === 'error') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{t('pages.booking_flow.after_sign.error')}</p>
        {fallback}
      </div>
    );
  }

  const { step } = state;
  if (step.next === 'portal') {
    return (
      <div className="space-y-3">
        <p className="text-gray-600">{t('pages.booking_flow.after_sign.portal_body')}</p>
        <Button type="button" variant="primary" className="w-full" onClick={() => navigate(step.portalPath)}>
          {t('pages.booking_flow.after_sign.portal_button')}
        </Button>
      </div>
    );
  }

  const amount = formatCurrency(step.amountMinor, step.currency, tenant?.locale ?? 'he-IL');
  return (
    <section className="space-y-3 text-start" aria-labelledby="after-sign-pay-heading">
      <h3 id="after-sign-pay-heading" className="text-base font-semibold">
        {t('pages.booking_flow.after_sign.pay_heading')}
      </h3>
      <p className="text-gray-600">{t('pages.booking_flow.after_sign.pay_body', { amount })}</p>
      <Button type="button" variant="primary" size="lg" className="w-full" onClick={() => navigate(step.payPath)}>
        {t('pages.booking_flow.after_sign.pay_button')}
      </Button>
      <div role="status" aria-live="polite" className="text-sm text-gray-600">
        {autoRedirect && t('pages.booking_flow.after_sign.redirecting', { count: AUTO_REDIRECT_SECONDS })}
      </div>
      {autoRedirect && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setAutoRedirect(false)}>
          {t('pages.booking_flow.after_sign.stay')}
        </Button>
      )}
      {!autoRedirect && <BackToPortalButton />}
    </section>
  );
}
