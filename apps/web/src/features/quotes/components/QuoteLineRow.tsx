import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { parseMajorToMinor, type QuoteLineDraft } from '../lib/quoteSchemas';
import { minorToMajorInput } from '../lib/quoteFormat';

interface QuoteLineRowProps {
  index: number;
  line: QuoteLineDraft;
  onChange: (line: QuoteLineDraft) => void;
  onRemove: () => void;
}

export function QuoteLineRow({ index, line, onChange, onRemove }: QuoteLineRowProps) {
  const { t } = useTranslation();
  const [priceText, setPriceText] = useState(() => minorToMajorInput(line.unit_price_minor));
  const priceValid = parseMajorToMinor(priceText) !== null;
  const id = (field: string) => `quote-line-${index}-${field}`;

  return (
    <tr>
      <td className="px-2 py-1">
        <label htmlFor={id('description')} className="sr-only">{t('pages.quotes.lines.description')}</label>
        <input
          id={id('description')}
          className="w-full border rounded px-2 py-1"
          value={line.description}
          maxLength={500}
          onChange={(e) => onChange({ ...line, description: e.target.value })}
        />
      </td>
      <td className="px-2 py-1 w-20">
        <label htmlFor={id('qty')} className="sr-only">{t('pages.quotes.lines.qty')}</label>
        <input
          id={id('qty')}
          type="number"
          min={1}
          max={100}
          className="w-full border rounded px-2 py-1"
          value={line.qty}
          onChange={(e) => onChange({ ...line, qty: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
        />
      </td>
      <td className="px-2 py-1 w-32">
        <label htmlFor={id('price')} className="sr-only">{t('pages.quotes.lines.unit_price')}</label>
        <input
          id={id('price')}
          inputMode="decimal"
          dir="ltr"
          aria-invalid={!priceValid}
          className="w-full border rounded px-2 py-1"
          value={priceText}
          onChange={(e) => {
            setPriceText(e.target.value);
            const minor = parseMajorToMinor(e.target.value);
            if (minor !== null) onChange({ ...line, unit_price_minor: minor });
          }}
        />
      </td>
      <td className="px-2 py-1 text-center">
        <input
          id={id('optional')}
          type="checkbox"
          aria-label={t('pages.quotes.lines.optional')}
          checked={line.is_optional}
          onChange={(e) => onChange({ ...line, is_optional: e.target.checked, is_selected: !e.target.checked })}
        />
      </td>
      <td className="px-2 py-1 text-end">
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('pages.quotes.lines.remove')}
        </Button>
      </td>
    </tr>
  );
}
