import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { QuoteLineDraft } from '../lib/quoteSchemas';
import type { QuotePackage } from '../services/quoteService';
import { formatQuoteMoney } from '../lib/quoteFormat';
import { QuoteLineRow } from './QuoteLineRow';

interface QuoteLinesEditorProps {
  lines: QuoteLineDraft[];
  onChange: (lines: QuoteLineDraft[]) => void;
  packages: QuotePackage[];
  currency: string;
}

/** Lines are keyed by a local counter so price inputs keep their text while editing. */
export function QuoteLinesEditor({ lines, onChange, packages, currency }: QuoteLinesEditorProps) {
  const { t, i18n } = useTranslation();
  const [packageId, setPackageId] = useState('');
  const [keys, setKeys] = useState<number[]>(() => lines.map((_, i) => i));
  const [nextKey, setNextKey] = useState(lines.length);

  const add = (line: QuoteLineDraft) => {
    onChange([...lines, line]);
    setKeys([...keys, nextKey]);
    setNextKey(nextKey + 1);
  };
  const remove = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
    setKeys(keys.filter((_, i) => i !== index));
  };
  const addPackage = (asOptional: boolean) => {
    const pkg = packages.find((p) => p.id === packageId);
    if (!pkg) return;
    add({
      offering_id: pkg.id, description: pkg.name, qty: 1, unit_price_minor: pkg.price_minor,
      is_optional: asOptional, is_selected: !asOptional,
    });
    setPackageId('');
  };

  return (
    <section aria-labelledby="quote-lines-heading" className="space-y-3">
      <h2 id="quote-lines-heading" className="font-semibold">{t('pages.quotes.lines.title')}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1 text-start">{t('pages.quotes.lines.description')}</th>
              <th className="px-2 py-1 text-start">{t('pages.quotes.lines.qty')}</th>
              <th className="px-2 py-1 text-start">{t('pages.quotes.lines.unit_price')}</th>
              <th className="px-2 py-1">{t('pages.quotes.lines.optional')}</th>
              <th className="px-2 py-1"><span className="sr-only">{t('pages.quotes.lines.remove')}</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <QuoteLineRow
                key={keys[index]}
                index={keys[index] ?? index}
                line={line}
                onChange={(next) => onChange(lines.map((l, i) => (i === index ? next : l)))}
                onRemove={() => remove(index)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="quote-package" className="block text-sm font-medium mb-1">
            {t('pages.quotes.lines.package')}
          </label>
          <select
            id="quote-package"
            className="border rounded px-3 py-2"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            <option value="">{t('pages.quotes.lines.choose_package')}</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatQuoteMoney(p.price_minor, currency, i18n.language)}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" disabled={!packageId} onClick={() => addPackage(false)}>
          {t('pages.quotes.lines.add_package')}
        </Button>
        <Button type="button" variant="outline" disabled={!packageId} onClick={() => addPackage(true)}>
          {t('pages.quotes.lines.add_addon')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => add({
            offering_id: null, description: '', qty: 1, unit_price_minor: 0, is_optional: false, is_selected: true,
          })}
        >
          {t('pages.quotes.lines.add_custom')}
        </Button>
      </div>
    </section>
  );
}
