import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { fetchJobNextStep, type JobNextStep } from '../services/jobNextStepService';
import { BackToPortalButton } from './BackToPortalButton';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; step: JobNextStep };

/**
 * Shown on /enrol/complete after a JOB contract is signed (or was already
 * signed): go straight to the unpaid deposit (owner rule: no screen in between),
 * or to the client portal when the deposit is paid or there is none. Dance
 * waivers never render this. The pay button stays as a fallback while the
 * payment page opens.
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
    if (payPath) navigate(payPath, { replace: true });
  }, [payPath, navigate]);

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
        {t('pages.booking_flow.after_sign.redirecting_now')}
      </div>
      <BackToPortalButton />
    </section>
  );
}

/**
 * On the contract page, before signing: the way straight to the deposit, so the
 * contract never stands in front of payment (owner rule). Shown only while a
 * deposit is waiting; nothing is shown if the next step cannot be loaded.
 */
export function JobPayFirstLink({ engagementId, waiverToken }: { engagementId: string; waiverToken: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [payPath, setPayPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchJobNextStep(engagementId, waiverToken)
      .then((step) => { if (!cancelled && step.next === 'pay_deposit') setPayPath(step.payPath); })
      .catch(() => { /* the signing form still works; the pay link is also in the booking email */ });
    return () => { cancelled = true; };
  }, [engagementId, waiverToken]);

  if (!payPath) return null;
  return (
    <Button type="button" variant="outline" className="w-full" onClick={() => navigate(payPath)}>
      {t('pages.booking_flow.after_sign.pay_first')}
    </Button>
  );
}
