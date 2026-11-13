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
  onSaved: (id: string, options: { email: boolean }) => void;
  /** Show "Save and email quote" as the main button (emails are on for quotes). */
  canEmail?: boolean;
  /** Set while the page emails the quote after saving. */
  emailing?: boolean;
}

export function QuoteEditor({ initial, currency, editable, onSaved, canEmail = false, emailing = false }: QuoteEditorProps) {
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
    // Which button sent the form: "Save and email quote" or "Save quote".
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const email = canEmail && submitter?.dataset.email === 'yes';
    const parsed = quoteDraftSchema.safeParse(draft);
    if (!parsed.success) {
      setValidationError(t('pages.quotes.errors.invalid'));
      return;
    }
    setValidationError(null);
    save.mutate(parsed.data, { onSuccess: (id) => onSaved(id, { email }) });
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
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" data-email="no" variant={canEmail ? 'outline' : 'primary'} disabled={save.isPending || emailing}>
            {t('pages.quotes.save')}
          </Button>
          {canEmail && (
            <Button type="submit" data-email="yes" variant="primary" isLoading={save.isPending || emailing}>
              {t('pages.quotes.save_and_email')}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
