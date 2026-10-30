import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDueDate, formatMinor, statusBadgeVariant, statusI18nKey } from '../lib/jobPaymentFormat';
import { JobPaymentService } from '../services/jobPaymentService';

interface Props {
  token: string;
  /** `result` query param set by the hosted page return URL. */
  result: string | null;
}

const POLL_MS = 3000;
const POLL_LIMIT = 40;

/**
 * /pay/:token — the client's view of one deposit/balance request. "Pay" asks
 * the backend for the hosted YPay page and redirects; coming back with
 * ?result=success polls until the webhook has marked the request paid.
 */
export function PublicPayRequest({ token, result }: Props) {
  const { t, i18n } = useTranslation();
  const [polls, setPolls] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['public-pay-request', token],
    queryFn: () => JobPaymentService.publicRequest(token, 'get'),
    retry: false,
  });
  const request = query.data?.request ?? null;
  const language = request?.studio.language ?? (i18n.language === 'he' ? 'he' : 'en');
  const awaitingWebhook = result === 'success' && request !== null && request.status !== 'paid';

  useEffect(() => {
    if (!awaitingWebhook || polls >= POLL_LIMIT) return;
    const id = setTimeout(() => {
      setPolls((n) => n + 1);
      void query.refetch();
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [awaitingWebhook, polls, query]);

  const pay = async () => {
    setError(null);
    setRedirecting(true);
    try {
      const res = await JobPaymentService.publicRequest(token, 'create_charge');
      if (!res.pageUrl) throw new Error(t('pages.pay.noPage'));
      window.location.assign(res.pageUrl);
    } catch (err) {
      setRedirecting(false);
      setError(err instanceof Error ? err.message : t('errors.generic'));
    }
  };

  if (query.isLoading) return <p className="p-6 text-center">{t('common.loading')}</p>;
  if (query.error || !request) {
    return <p role="alert" className="p-6 text-center text-error">{t('pages.pay.notFound')}</p>;
  }

  const collectable = (request.status === 'pending' || request.status === 'sent') && !request.jobCancelled;

  return (
    <main className="mx-auto max-w-md p-4" lang={language}>
      <Card>
        <CardHeader>
          <CardTitle>{request.studio.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-lg font-medium">
            <bdi>{request.label}</bdi>
          </p>
          <p className="text-2xl font-semibold" dir="ltr">
            {formatMinor(request.amountMinor, request.currency, language)}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('pages.jobs.payments.dueOn', { date: formatDueDate(request.dueDate, language) })}
            {request.jobDate && ` · ${t('pages.pay.jobDate', { date: formatDueDate(request.jobDate, language) })}`}
          </p>
          <Badge variant={statusBadgeVariant(request.status)}>{t(statusI18nKey(request.status))}</Badge>

          {request.status === 'paid' && <p className="text-sm">{t('pages.pay.paidThanks')}</p>}
          {awaitingWebhook && polls < POLL_LIMIT && (
            <p className="text-sm" aria-live="polite">{t('pages.pay.confirming')}</p>
          )}
          {awaitingWebhook && polls >= POLL_LIMIT && (
            <p className="text-sm" aria-live="polite">{t('pages.pay.confirmLater')}</p>
          )}
          {result === 'failed' && collectable && (
            <p role="alert" className="text-sm text-error">{t('pages.pay.failed')}</p>
          )}
          {request.jobCancelled && <p className="text-sm text-error">{t('pages.pay.jobCancelled')}</p>}
          {!collectable && request.status !== 'paid' && !request.jobCancelled && (
            <p className="text-sm text-muted-foreground">{t('pages.pay.notCollectable')}</p>
          )}

          {collectable && !awaitingWebhook && (
            <>
              {request.maxInstallments > 1 && (
                <p className="text-sm text-muted-foreground">
                  {t('pages.pay.installmentsAvailable', { count: request.maxInstallments })}
                </p>
              )}
              <Button variant="primary" fullWidth isLoading={redirecting} onClick={() => void pay()}>
                {t('pages.pay.payNow')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('pages.pay.invoiceNote')}</p>
            </>
          )}
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
