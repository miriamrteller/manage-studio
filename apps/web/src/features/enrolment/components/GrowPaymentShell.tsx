import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

interface GrowPaymentShellProps {
  engagementId: string;
  pageUrl: string;
  enrolmentToken?: string;
  onPaid: () => void;
  onPrevious: () => void;
}

type PollPhase = 'paying' | 'timeout' | 'failed';

interface PaymentStatus {
  paid: boolean;
  paymentId?: string;
  failureReason?: string | null;
}

/**
 * Grow (Meshulam) hosted-page checkout. We embed the hosted page in an iframe and poll
 * `get-payment-status` until the webhook finalises the charge, since Grow confirms payments
 * server-side rather than inline. After the timeout we surface a retry CTA.
 */
export function GrowPaymentShell({
  engagementId,
  pageUrl,
  enrolmentToken,
  onPaid,
  onPrevious,
}: GrowPaymentShellProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<PollPhase>('paying');
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const checkStatus = useCallback(async (): Promise<PaymentStatus> => {
    const { data, error } = await supabase.functions.invoke('get-payment-status', {
      body: {
        engagement_id: engagementId,
        ...(enrolmentToken ? { enrolment_token: enrolmentToken } : {}),
      },
      ...(enrolmentToken ? { headers: { Authorization: `WaiverToken ${enrolmentToken}` } } : {}),
    });
    if (error || !data) return { paid: false };
    return data as PaymentStatus;
  }, [engagementId, enrolmentToken]);

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();
    setPhase('paying');
    setFailureReason(null);

    const tick = async () => {
      if (!active) return;
      const status = await checkStatus();
      if (!active) return;

      if (status.paid) {
        onPaidRef.current();
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
      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    let timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [checkStatus, attempt]);

  const isMockPage = pageUrl.includes('mock.grow.local');

  return (
    <div className="space-y-4">
      {isMockPage ? (
        <div
          className="w-full border border-dashed border-border rounded-lg p-6 text-center space-y-2 bg-muted/30"
          data-testid="grow-mock-page"
        >
          <p className="font-medium">
            {t('enrolment.grow_mock_title', { defaultValue: 'Mock Grow payment page' })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('enrolment.grow_mock_hint', {
              defaultValue:
                'GROW_MOCK is on, so the hosted page is simulated and the payment auto-confirms.',
            })}
          </p>
        </div>
      ) : (
        <iframe
          title={t('enrolment.grow_payment_title', { defaultValue: 'Secure payment' })}
          src={pageUrl}
          className="w-full h-[520px] border border-border rounded-lg"
        />
      )}

      {phase === 'paying' && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {t('enrolment.grow_waiting', {
            defaultValue: 'Waiting for payment confirmation… this can take a few seconds.',
          })}
        </p>
      )}

      {phase === 'failed' && (
        <p className="text-sm text-destructive" role="alert">
          {failureReason ?? t('enrolment.payment_failed')}
        </p>
      )}

      {phase === 'timeout' && (
        <p className="text-sm text-destructive" role="alert">
          {t('enrolment.grow_timeout', {
            defaultValue:
              'We have not received confirmation yet. If you completed payment, please wait a moment and retry.',
          })}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onPrevious}>
          {t('common.back')}
        </Button>
        {(phase === 'timeout' || phase === 'failed') && (
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {t('enrolment.grow_retry', { defaultValue: 'Retry' })}
          </Button>
        )}
      </div>
    </div>
  );
}
