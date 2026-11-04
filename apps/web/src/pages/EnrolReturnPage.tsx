import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { EnrolmentPaymentSuccess } from '@/features/enrolment/components/EnrolmentPaymentSuccess';
import { enrolPayPath, readYpayReturnToken } from '@/features/enrolment/lib/ypayReturn';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

type Phase = 'waiting' | 'paid' | 'failed' | 'timeout';

/**
 * /enrol/return/:engagementId?result=success|failed — where YPay sends the parent back after
 * its payment page. On success it waits until YPay's verified callback has marked the payment
 * paid (get-payment-status), then shows the usual "Payment complete".
 */
export default function EnrolReturnPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { engagementId = '' } = useParams<{ engagementId: string }>();
  const [searchParams] = useSearchParams();
  const returnedFailed = searchParams.get('result') === 'failed';
  const token = readYpayReturnToken(engagementId);
  const [phase, setPhase] = useState<Phase>(returnedFailed ? 'failed' : 'waiting');
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (returnedFailed || !engagementId) return;
    let active = true;
    let timer: number | undefined;
    const startedAt = Date.now();
    setPhase('waiting');

    const tick = async () => {
      const { data } = await supabase.functions.invoke('get-payment-status', {
        body: { engagement_id: engagementId, ...(token ? { enrolment_token: token } : {}) },
        ...(token ? { headers: { Authorization: `WaiverToken ${token}` } } : {}),
      });
      if (!active) return;
      const status = (data ?? {}) as { paid?: boolean; failureReason?: string | null };
      if (status.paid) {
        try {
          sessionStorage.setItem('portalEngagementId', engagementId);
        } catch {
          // Storage blocked: only the portal shortcut is lost.
        }
        setPhase('paid');
        return;
      }
      if (status.failureReason) {
        setFailureReason(status.failureReason);
        setPhase('failed');
        return;
      }
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setPhase('timeout');
        return;
      }
      timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    void tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [engagementId, token, returnedFailed, attempt]);

  if (phase === 'paid') {
    return <EnrolmentPaymentSuccess onClose={() => navigate('/classes')} closeLabel={t('common.close')} />;
  }

  return (
    <div className="max-w-lg mx-auto p-6 space-y-4 text-center">
      <h1 className="text-2xl font-bold">{t('pages.enrol_pay.title')}</h1>

      {phase === 'waiting' && (
        <p className="text-gray-600" role="status" aria-live="polite">
          {t('enrolment.ypay_waiting')}
        </p>
      )}

      {phase === 'timeout' && (
        <>
          <p className="text-gray-600" role="status" aria-live="polite">
            {t('enrolment.ypay_timeout')}
          </p>
          <Button type="button" variant="primary" onClick={() => setAttempt((n) => n + 1)}>
            {t('enrolment.ypay_check_again')}
          </Button>
        </>
      )}

      {phase === 'failed' && (
        <>
          <p className="text-destructive" role="alert">
            {failureReason ?? t('enrolment.ypay_failed')}
          </p>
          <Button type="button" variant="primary" onClick={() => navigate(enrolPayPath(engagementId, token))}>
            {t('enrolment.ypay_retry')}
          </Button>
        </>
      )}
    </div>
  );
}
