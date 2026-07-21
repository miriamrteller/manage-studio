import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { CheckoutChargePayload } from '../lib/checkoutBootstrapTypes';
import { chargeToCheckoutIntent } from '../lib/checkoutBootstrapTypes';
import { ProviderCheckoutShell } from './EnrolmentCheckoutShells';

export interface CheckoutPaymentShellProps {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  charge: CheckoutChargePayload;
  onPaid: () => void;
  onPrevious: () => void;
}

export function CheckoutPaymentShell({
  classId,
  engagementId,
  enrolmentToken,
  charge,
  onPaid,
  onPrevious,
}: CheckoutPaymentShellProps) {
  const { t } = useTranslation();
  const intent = chargeToCheckoutIntent(charge);

  useEffect(() => {
    if (intent.mockCompleted) {
      onPaid();
    }
  }, [intent.mockCompleted, onPaid]);

  if (intent.mockCompleted) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <ProviderCheckoutShell
      classId={classId}
      engagementId={engagementId}
      enrolmentToken={enrolmentToken}
      paymentProvider={intent.paymentProvider}
      mockPending={intent.mockPending}
      clientSecret={intent.clientSecret}
      publishableKey={intent.publishableKey}
      amountMinor={intent.amountMinor}
      currency={intent.currency}
      mockPaymentRef={intent.mockPaymentRef}
      pageUrl={intent.pageUrl}
      billingMode={intent.billingMode}
      billingInterval={intent.billingInterval}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}
