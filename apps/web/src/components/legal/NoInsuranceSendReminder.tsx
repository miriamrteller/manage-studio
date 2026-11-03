import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { hasHealthDeclarations, insuranceStatus } from '@shared/legal/signed-template';

const dismissKey = (tenantId: string) => `no-insurance-send-reminder-dismissed:${tenantId}`;

function readDismissed(tenantId: string): boolean {
  try {
    return window.sessionStorage.getItem(dismissKey(tenantId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Shown where a studio admin sends a health declaration / form link while the
 * studio has recorded no insurance. A reminder only: it never blocks the send
 * and asks for nothing. Dismissed for the rest of the browser session.
 */
export function NoInsuranceSendReminder() {
  const { t } = useTranslation();
  const { data: legal } = useTenantLegalProfile();
  const tenantId = legal?.tenantId ?? '';
  const [dismissed, setDismissed] = useState(() => (tenantId ? readDismissed(tenantId) : false));

  if (!legal || !hasHealthDeclarations(legal.vertical) || insuranceStatus(legal.profile) !== 'none') return null;
  if (dismissed || readDismissed(tenantId)) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(dismissKey(tenantId), '1');
    } catch {
      // Private mode: hide it for this screen only.
    }
    setDismissed(true);
  };

  return (
    <div role="note" className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="flex-1">{t('legal.no_insurance_send_reminder.text')}</p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 font-medium underline focus-visible:outline-2 outline-offset-2"
      >
        {t('legal.no_insurance_send_reminder.dismiss')}
      </button>
    </div>
  );
}
