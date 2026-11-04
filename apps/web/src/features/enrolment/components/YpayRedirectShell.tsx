import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { rememberYpayReturnToken } from '../lib/ypayReturn';

/**
 * YPay: the parent pays on YPay's own page (a full redirect, like the project pay link).
 * YPay sends them back to /enrol/return/:engagementId, which waits for YPay's confirmation.
 */
export function YpayRedirectShell({
  engagementId,
  pageUrl,
  enrolmentToken,
  onPrevious,
}: {
  engagementId: string;
  pageUrl: string;
  enrolmentToken?: string;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();
  const [redirecting, setRedirecting] = useState(false);

  const goToYpay = () => {
    setRedirecting(true);
    rememberYpayReturnToken(engagementId, enrolmentToken);
    window.location.assign(pageUrl);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('enrolment.ypay_redirect_hint')}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onPrevious} disabled={redirecting}>
          {t('common.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={goToYpay}
          isLoading={redirecting}
        >
          {t('enrolment.ypay_continue')}
        </Button>
      </div>
    </div>
  );
}
