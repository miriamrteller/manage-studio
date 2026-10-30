import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { computeQuoteTotals } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { BackToPortalButton } from '@/features/jobs/components/BackToPortalButton';
import { QuoteTotalsSummary } from '../QuoteTotalsSummary';
import { formatQuoteDate } from '../../lib/quoteFormat';
import {
  acceptPublicQuote, declinePublicQuote, fetchPublicQuote, type AcceptQuoteResponse, type PublicQuote,
} from '../../services/publicQuoteService';
import { PublicQuoteActions } from './PublicQuoteActions';
import { PublicQuoteLines } from './PublicQuoteLines';
import { PublicQuoteNextSteps } from './PublicQuoteNextSteps';

export function PublicQuoteView({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const queryKey = ['public-quote', tenant?.id, token];
  const { data: quote, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => (tenant ? fetchPublicQuote(token, tenant.id) : Promise.resolve(null)),
    enabled: !!tenant?.id,
  });

  if (!tenant || isLoading) return <p role="status">{t('common.loading')}</p>;
  if (error instanceof Error) return <div className="alert-error" role="alert">{error.message}</div>;
  if (!quote) return <p>{t('pages.public_quote.not_found')}</p>;
  return (
    <QuoteBody quote={quote} token={token} tenantId={tenant.id} language={i18n.language}
      onSettled={() => queryClient.invalidateQueries({ queryKey })} />
  );
}

interface QuoteBodyProps {
  quote: PublicQuote;
  token: string;
  tenantId: string;
  language: string;
  onSettled: () => void;
}

function QuoteBody({ quote, token, tenantId, language, onSettled }: QuoteBodyProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(quote.lines.filter((l) => l.is_optional && l.is_selected).map((l) => l.id)),
  );
  const open = quote.status === 'sent';
  const totals = useMemo(
    () => computeQuoteTotals(quote.lines.map((l) => ({ ...l, is_selected: selected.has(l.id) })), quote.deposit_percent),
    [quote.lines, quote.deposit_percent, selected],
  );

  const accept = useMutation<AcceptQuoteResponse>({
    mutationFn: () => acceptPublicQuote({ token, tenantId, selectedLineIds: [...selected] }),
    onSuccess: onSettled,
  });
  const decline = useMutation({
    mutationFn: (reason: string | null) => declinePublicQuote(token, tenantId, reason),
    onSuccess: onSettled,
  });
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const failure = accept.data && !accept.data.ok ? t(`pages.public_quote.errors.${accept.data.code ?? 'generic'}`) : null;

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{quote.title ?? t('pages.public_quote.title')}</h1>
        {quote.client_name && <p>{t('pages.public_quote.for', { name: quote.client_name })}</p>}
        <p className="text-sm text-muted-foreground">
          {quote.shoot_date && t('pages.public_quote.shoot_date', { date: formatQuoteDate(quote.shoot_date, language) })}
          {quote.valid_until && open && (
            <span className="ms-3">{t('pages.public_quote.valid_until', { date: formatQuoteDate(quote.valid_until, language) })}</span>
          )}
        </p>
      </header>
      {quote.notes && <p className="whitespace-pre-wrap">{quote.notes}</p>}
      <section className="card p-4">
        <PublicQuoteLines lines={quote.lines} currency={quote.currency} selected={selected} onToggle={open ? toggle : null} />
      </section>
      <section className="card p-4">
        <QuoteTotalsSummary totals={totals} currency={quote.currency} depositPercent={quote.deposit_percent} />
      </section>
      <div role="status" aria-live="polite">
        {quote.status === 'accepted' && <p className="alert-success">{t('pages.public_quote.accepted')}</p>}
        {quote.status === 'accepted' && accept.data?.contract_to_follow && <p>{t('pages.public_quote.contract_to_follow')}</p>}
        {quote.status === 'declined' && <p>{t('pages.public_quote.declined')}</p>}
        {quote.status === 'expired' && <p>{t('pages.public_quote.expired')}</p>}
      </div>
      {(failure || accept.error || decline.error) && (
        <div className="alert-error" role="alert">
          {failure ?? (accept.error ?? decline.error)?.message}
        </div>
      )}
      {quote.status === 'accepted' && (
        <PublicQuoteNextSteps result={accept.data ?? null} busy={accept.isPending} onResume={() => accept.mutate()} />
      )}
      {quote.status === 'accepted' && <BackToPortalButton />}
      {open && (
        <PublicQuoteActions busy={accept.isPending || decline.isPending}
          onAccept={() => accept.mutate()} onDecline={(reason) => decline.mutate(reason)} />
      )}
    </article>
  );
}
