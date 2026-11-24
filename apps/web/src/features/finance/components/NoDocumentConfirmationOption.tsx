import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';

const NUDGE_DISMISSED_KEY = 'opalswift.invoicing-nudge-dismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(NUDGE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Pure: studios that issue no tax documents get the confirmation option. */
export function offersNoDocumentConfirmation(invoicingProvider: string | null | undefined): boolean {
  return invoicingProvider === 'none';
}

/**
 * Record a payment, for a studio that issues no tax documents (invoicing "none"): a tick, on by
 * default, to email the payer a payment confirmation that is not a tax document, and a
 * dismissible nudge to connect invoicing. Never blocks recording. Renders nothing otherwise.
 */
export function NoDocumentConfirmationOption({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const [nudgeDismissed, setNudgeDismissed] = useState(readDismissed);

  if (!offersNoDocumentConfirmation(tenant?.invoicing_provider)) return null;

  const dismiss = () => {
    setNudgeDismissed(true);
    try {
      window.localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    } catch {
      // Per-viewer convenience only.
    }
  };

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${id}-hint`}
        />
        <span>{t('finance.no_document.send_label')}</span>
      </label>
      <p id={`${id}-hint`} className="ms-6 text-xs text-muted-foreground">
        {t('finance.no_document.send_hint')}
      </p>
      {!nudgeDismissed && (
        <div className="flex items-start justify-between gap-2 rounded border border-border px-3 py-2 text-sm" role="note">
          <p>
            {t('finance.no_document.nudge')}{' '}
            <Link to="/admin/settings?tab=invoicing" className="font-medium text-primary underline underline-offset-2">
              {t('finance.no_document.nudge_link')}
            </Link>
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-muted-foreground underline"
            onClick={dismiss}
          >
            {t('finance.no_document.dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}
