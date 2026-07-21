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
  provider?: 'grow' | 'icount' | 'invoice4u';
}

type PollPhase = 'paying' | 'timeout' | 'failed';

interface PaymentStatus {
  paid: boolean;
  paymentId?: string;
  failureReason?: string | null;
}

/**
 * Hosted-page checkout shell (Grow / iCount / Invoice4U). Embeds the hosted page
 * (or a mock panel) and polls `get-payment-status` until the webhook finalises.
 */
export function GrowPaymentShell({
  engagementId,
  pageUrl,
  enrolmentToken,
  onPaid,
  onPrevious,
  provider = 'grow',
}: GrowPaymentShellProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<PollPhase>('paying');
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const i18nPrefix =
    provider === 'icount' ? 'icount' : provider === 'invoice4u' ? 'invoice4u' : 'grow';

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

  const isMockPage =
    (provider === 'icount' && pageUrl.includes('mock.icount.local')) ||
    (provider === 'invoice4u' && pageUrl.includes('mock.invoice4u.local')) ||
    (provider === 'grow' && pageUrl.includes('mock.grow.local'));

  const mockTestId =
    provider === 'icount'
      ? 'icount-mock-page'
      : provider === 'invoice4u'
        ? 'invoice4u-mock-page'
        : 'grow-mock-page';

  return (
    <div className="space-y-4">
      {isMockPage ? (
        <div
          className="w-full border border-dashed border-border rounded-lg p-6 text-center space-y-2 bg-muted/30"
          data-testid={mockTestId}
        >
          <p className="font-medium">
            {t(`enrolment.${i18nPrefix}_mock_title`, {
              defaultValue: `Mock ${provider} payment page`,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t(`enrolment.${i18nPrefix}_mock_hint`, {
              defaultValue:
                'Mock mode is on, so the hosted page is simulated and the payment auto-confirms.',
            })}
          </p>
        </div>
      ) : (
        <iframe
          title={t(`enrolment.${i18nPrefix}_payment_title`, {
            defaultValue: 'Secure payment',
          })}
          src={pageUrl}
          className="w-full h-[520px] border border-border rounded-lg"
        />
      )}

      {phase === 'paying' && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {t(`enrolment.${i18nPrefix}_waiting`, {
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
          {t(`enrolment.${i18nPrefix}_timeout`, {
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
            {t(`enrolment.${i18nPrefix}_retry`, { defaultValue: 'Retry' })}
          </Button>
        )}
      </div>
    </div>
  );
}
