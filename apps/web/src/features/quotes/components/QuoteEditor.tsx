import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { computeQuoteTotals } from '@shared/index';
import { quoteDraftSchema, type QuoteDraft } from '../lib/quoteSchemas';
import { useQuoteMutations, useQuotePackages } from '../hooks/useQuotes';
import { QuoteLinesEditor } from './QuoteLinesEditor';
import { QuoteTermsFields } from './QuoteTermsFields';
import { QuoteTotalsSummary } from './QuoteTotalsSummary';

interface QuoteEditorProps {
  initial: QuoteDraft;
  currency: string;
  /** False once a quote is accepted/declined/expired: shown read-only. */
  editable: boolean;
  onSaved: (id: string) => void;
}

export function QuoteEditor({ initial, currency, editable, onSaved }: QuoteEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<QuoteDraft>(initial);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data: packages = [] } = useQuotePackages();
  const { save } = useQuoteMutations();

  // Preview only; the database recomputes and stores the authoritative totals.
  const totals = useMemo(
    () => computeQuoteTotals(draft.lines, draft.deposit_percent),
    [draft.lines, draft.deposit_percent],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = quoteDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationError(t('pages.quotes.errors.invalid'));
      return;
    }
    setValidationError(null);
    save.mutate(parsed.data, { onSuccess: onSaved });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" aria-label={t('pages.quotes.editor_title')}>
      <fieldset disabled={!editable || save.isPending} className="space-y-6">
        <section className="card p-4">
          <QuoteTermsFields value={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
        </section>
        <section className="card p-4">
          <QuoteLinesEditor
            lines={draft.lines}
            onChange={(lines) => setDraft({ ...draft, lines })}
            packages={packages}
            currency={currency}
          />
        </section>
      </fieldset>
      <section className="card p-4 max-w-md ms-auto">
        <QuoteTotalsSummary totals={totals} currency={currency} depositPercent={draft.deposit_percent} />
      </section>
      {(validationError || save.error) && (
        <div className="alert-error" role="alert">
          {validationError ?? save.error?.message}
        </div>
      )}
      {editable && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" isLoading={save.isPending}>
            {t('pages.quotes.save')}
          </Button>
        </div>
      )}
    </form>
  );
}
