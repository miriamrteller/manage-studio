import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { safePayPath, safeSignPath } from '@/features/jobs/lib/bookingFlowPaths';
import type { AcceptQuoteResponse } from '../../services/publicQuoteService';

interface PublicQuoteNextStepsProps {
  /** accept-quote's response (first accept or a replay); null on a revisit. */
  result: AcceptQuoteResponse | null;
  busy: boolean;
  /** Replays the (idempotent) accept to get fresh links on a revisit. */
  onResume: () => void;
}

/**
 * After acceptance: one primary button straight to payment (owner rule: nothing
 * ever blocks payment). Signing the contract is offered alongside, never as a
 * step before paying. The same links were emailed, so the client can stop here
 * and come back later.
 */
export function PublicQuoteNextSteps({ result, busy, onResume }: PublicQuoteNextStepsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!result) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" isLoading={busy} disabled={busy} onClick={onResume}>
          {t('pages.public_quote.next_steps.resume')}
        </Button>
      </div>
    );
  }
  if (!result.ok) return null;

  const signPath = safeSignPath(result.contractSignPath);
  const payPath = safePayPath(result.depositPayPath);
  if (!signPath && !payPath) return null;

  const intro = signPath && payPath
    ? t('pages.public_quote.next_steps.intro_pay_and_sign')
    : signPath
      ? t('pages.public_quote.next_steps.intro_sign')
      : t('pages.public_quote.next_steps.intro_pay');

  return (
    <section className="card p-4 space-y-3" aria-labelledby="quote-next-steps-heading">
      <h2 id="quote-next-steps-heading" className="text-lg font-semibold">
        {t('pages.public_quote.next_steps.heading')}
      </h2>
      <p>{intro}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" onClick={() => navigate((payPath ?? signPath) as string)}>
          {payPath ? t('pages.public_quote.next_steps.continue_to_pay') : t('pages.public_quote.next_steps.continue_to_sign')}
        </Button>
        {payPath && signPath && (
          <Button variant="outline" size="lg" onClick={() => navigate(signPath)}>
            {t('pages.public_quote.next_steps.sign_contract')}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t('pages.public_quote.next_steps.emailed')}</p>
    </section>
  );
}
