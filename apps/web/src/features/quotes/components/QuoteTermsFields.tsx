import { useTranslation } from 'react-i18next';
import type { QuoteDraft } from '../lib/quoteSchemas';

type Terms = Pick<
  QuoteDraft,
  'title' | 'shoot_date' | 'valid_until' | 'notes' | 'deposit_percent' | 'balance_max_installments' | 'send_contract_on_accept'
>;

interface QuoteTermsFieldsProps {
  value: Terms;
  onChange: (patch: Partial<Terms>) => void;
}

const clampInt = (raw: string, min: number, max: number, fallback: number) => {
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? fallback : Math.max(min, Math.min(max, n));
};

export function QuoteTermsFields({ value, onChange }: QuoteTermsFieldsProps) {
  const { t } = useTranslation();
  const field = 'w-full border rounded px-3 py-2';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="quote-title" className="block text-sm font-medium mb-1">{t('pages.quotes.fields.title')}</label>
        <input id="quote-title" className={field} maxLength={200} value={value.title ?? ''}
          onChange={(e) => onChange({ title: e.target.value || null })} />
      </div>
      <div>
        <label htmlFor="quote-shoot-date" className="block text-sm font-medium mb-1">{t('pages.quotes.fields.shoot_date')}</label>
        <input id="quote-shoot-date" type="date" className={field} value={value.shoot_date ?? ''}
          onChange={(e) => onChange({ shoot_date: e.target.value || null })} />
      </div>
      <div>
        <label htmlFor="quote-valid-until" className="block text-sm font-medium mb-1">{t('pages.quotes.fields.valid_until')}</label>
        <input id="quote-valid-until" type="date" className={field} value={value.valid_until ?? ''}
          onChange={(e) => onChange({ valid_until: e.target.value || null })} />
      </div>
      <div>
        <label htmlFor="quote-deposit" className="block text-sm font-medium mb-1">{t('pages.quotes.fields.deposit_percent')}</label>
        <input id="quote-deposit" type="number" min={0} max={100} className={field} value={value.deposit_percent}
          onChange={(e) => onChange({ deposit_percent: clampInt(e.target.value, 0, 100, 0) })} />
      </div>
      <div>
        <label htmlFor="quote-installments" className="block text-sm font-medium mb-1">
          {t('pages.quotes.fields.balance_installments')}
        </label>
        <input id="quote-installments" type="number" min={1} max={36} className={field}
          value={value.balance_max_installments}
          onChange={(e) => onChange({ balance_max_installments: clampInt(e.target.value, 1, 36, 1) })} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="quote-notes" className="block text-sm font-medium mb-1">{t('pages.quotes.fields.notes')}</label>
        <textarea id="quote-notes" rows={3} className={field} maxLength={5000} value={value.notes ?? ''}
          onChange={(e) => onChange({ notes: e.target.value || null })} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={value.send_contract_on_accept}
          onChange={(e) => onChange({ send_contract_on_accept: e.target.checked })} />
        {t('pages.quotes.fields.send_contract')}
      </label>
    </div>
  );
}
