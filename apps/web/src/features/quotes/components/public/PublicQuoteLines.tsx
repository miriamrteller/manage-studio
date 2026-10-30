import { useTranslation } from 'react-i18next';
import type { PublicQuoteLine } from '../../services/publicQuoteService';
import { formatQuoteMoney } from '../../lib/quoteFormat';

interface PublicQuoteLinesProps {
  lines: PublicQuoteLine[];
  currency: string;
  selected: ReadonlySet<string>;
  /** Null when the quote is settled: add-ons are shown, not editable. */
  onToggle: ((lineId: string) => void) | null;
}

export function PublicQuoteLines({ lines, currency, selected, onToggle }: PublicQuoteLinesProps) {
  const { t, i18n } = useTranslation();
  const money = (minor: number) => <bdi>{formatQuoteMoney(minor, currency, i18n.language)}</bdi>;
  const required = lines.filter((line) => !line.is_optional);
  const addons = lines.filter((line) => line.is_optional);

  return (
    <div className="space-y-6">
      <ul className="divide-y">
        {required.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-4 py-2">
            <span>
              {line.description}
              {line.qty > 1 && <span className="ms-2 text-sm text-muted-foreground">× {line.qty}</span>}
            </span>
            <span className="font-medium">{money(line.line_total_minor)}</span>
          </li>
        ))}
      </ul>

      {addons.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="font-semibold mb-1">{t('pages.public_quote.addons')}</legend>
          {addons.map((line) => (
            <label key={line.id} className="flex items-center justify-between gap-4 rounded border p-3">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(line.id)}
                  disabled={!onToggle}
                  onChange={() => onToggle?.(line.id)}
                />
                <span>
                  {line.description}
                  {line.qty > 1 && <span className="ms-2 text-sm text-muted-foreground">× {line.qty}</span>}
                </span>
              </span>
              <span className="font-medium">+{money(line.line_total_minor)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
