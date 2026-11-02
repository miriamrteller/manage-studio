import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type StudioCountry = 'IL' | 'US';

export interface CountryChoiceProps {
  /** Prefix for element ids (two forms can be on one page in tests). */
  idPrefix: string;
  value: StudioCountry;
  onChange: (country: StudioCountry) => void;
  /** Ticked "I understand" for a country other than Israel. */
  acknowledged: boolean;
  onAcknowledgedChange: (ticked: boolean) => void;
  /** Ask for the tick when another country is chosen (off for a saved non-Israel studio left as it is). */
  requireAck?: boolean;
}

/**
 * The studio's country: Israel unless the owner says otherwise. OpalSwift's
 * payment providers, tax documents and legal templates are Israel-only, so the
 * choice sits behind "Not in Israel?" with a warning, and another country
 * needs a tick (see countryChoiceComplete).
 */
export function CountryChoice({
  idPrefix,
  value,
  onChange,
  acknowledged,
  onAcknowledgedChange,
  requireAck = true,
}: CountryChoiceProps) {
  const { t } = useTranslation();
  // A studio already outside Israel sees its choice straight away.
  const [open, setOpen] = useState(value !== 'IL');
  // ...also when the saved value arrives after the first render (Settings).
  useEffect(() => {
    if (value !== 'IL') setOpen(true);
  }, [value]);
  const labelId = `${idPrefix}-label`;
  const selectId = `${idPrefix}-select`;
  const moreId = `${idPrefix}-more`;
  const warningId = `${idPrefix}-warning`;

  if (!open) {
    return (
      <div className="space-y-2">
        <p className="block text-sm font-medium" id={labelId}>
          {t('studio_setup.country')}
        </p>
        <div role="group" className="flex flex-wrap items-baseline gap-x-3" aria-labelledby={labelId}>
          <span>{t('studio_setup.country_il')}</span>
          <button
            type="button"
            className="text-sm underline underline-offset-2"
            aria-expanded={false}
            aria-controls={moreId}
            onClick={() => setOpen(true)}
          >
            {t('studio_setup.country_not_israel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id={moreId} className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={selectId}>
        {t('studio_setup.country')}
      </label>
      <select
        id={selectId}
        className="form-input w-full"
        value={value}
        aria-describedby={warningId}
        onChange={(e) => {
          onChange(e.target.value === 'US' ? 'US' : 'IL');
          onAcknowledgedChange(false);
        }}
      >
        <option value="IL">{t('studio_setup.country_il')}</option>
        <option value="US">{t('studio_setup.country_us')}</option>
      </select>
      <p id={warningId} role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {t('studio_setup.country_outside_warning')}
      </p>
      {value !== 'IL' && requireAck && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={acknowledged}
            onChange={(e) => onAcknowledgedChange(e.target.checked)}
          />
          <span>{t('studio_setup.country_outside_ack')}</span>
        </label>
      )}
    </div>
  );
}

/** Whether the country choice lets the form continue. */
export function countryChoiceComplete(value: StudioCountry, acknowledged: boolean, requireAck = true): boolean {
  return value === 'IL' || !requireAck || acknowledged;
}
