import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import {
  functionInvokeErrorMessage,
  parseFunctionInvokeBody,
} from '@/lib/parseFunctionInvokeError';
import { formatCurrency } from '@shared/format';
import { GrowPaymentShell } from './GrowPaymentShell';
import { IcountPaymentShell } from './IcountPaymentShell';
import { Invoice4uPaymentShell } from './Invoice4uPaymentShell';
import { isMockHostedPaymentPage } from '@/lib/tenantProviderRouting';

function PaymentFormInner({
  onPaid,
  onPrevious,
}: {
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setIsPaying(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    setIsPaying(false);

    if (confirmError) {
      setError(confirmError.message ?? t('enrolment.payment_failed'));
      return;
    }

    onPaid();
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onPrevious}
          disabled={isPaying}
        >
          {t('common.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={handlePay}
          disabled={isPaying || !stripe}
          isLoading={isPaying}
        >
          {t('enrolment.pay_now')}
        </Button>
      </div>
    </div>
  );
}

const MOCK_DECLINE_CARD = '4580000000000000';

export function MockPaymentShell({
  classId,
  engagementId,
  enrolmentToken,
  amountMinor,
  currency,
  mockPaymentRef,
  onPaid,
  onPrevious,
}: {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  amountMinor: number | null;
  currency: string | null;
  mockPaymentRef: string | null;
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [cardNumber, setCardNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const handleConfirm = async () => {
    setIsPaying(true);
    setError(null);

    const { data, error: invokeError } = await supabase.functions.invoke('confirm-mock-payment', {
      body: {
        offering_id: classId,
        engagement_id: engagementId,
        ...(enrolmentToken ? { enrolment_token: enrolmentToken } : {}),
        mock_card_number: cardNumber || undefined,
        mock_payment_ref: mockPaymentRef ?? undefined,
      },
      ...(enrolmentToken
        ? { headers: { Authorization: `WaiverToken ${enrolmentToken}` } }
        : {}),
    });

    setIsPaying(false);

    const body = await parseFunctionInvokeBody(data, invokeError);
    const declinedMessage = t('enrolment.mock_payment_declined', {
      defaultValue: 'Your card was declined. Please check the number or try a different card.',
    });

    if (body?.code === 'MOCK_PAYMENT_DECLINED') {
      setError(declinedMessage);
      return;
    }

    if (body?.confirmed) {
      onPaid();
      return;
    }

    if (invokeError || body?.error) {
      setError(
        functionInvokeErrorMessage(invokeError, body, t('enrolment.payment_failed')),
      );
      return;
    }

    setError(t('enrolment.payment_failed'));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t('enrolment.mock_payment_hint', {
          defaultValue: 'Test payment — enter card details and pay to complete enrolment.',
        })}
      </p>
      {amountMinor != null && currency && (
        <p className="text-sm font-medium">
          {t('enrolment.checkout_total', { defaultValue: 'Total' })}:{' '}
          {formatCurrency(amountMinor, currency, i18n.language)}
        </p>
      )}
      <label className="block text-sm font-medium">
        {t('enrolment.mock_card_number', { defaultValue: 'Test card number' })}
        <input
          type="text"
          inputMode="numeric"
          className="mt-1 w-full border border-border rounded px-3 py-2"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          placeholder="4580458045804580"
          autoComplete="off"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {t('enrolment.mock_success_hint', {
          defaultValue: 'Use 4580458045804580 for a successful test payment.',
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('enrolment.mock_decline_hint', {
          defaultValue: `Use ${MOCK_DECLINE_CARD} to simulate decline.`,
        })}
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onPrevious} disabled={isPaying}>
          {t('common.back')}
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={() => handleConfirm()}
          disabled={isPaying}
          isLoading={isPaying}
        >
          {t('enrolment.pay_now')}
        </Button>
      </div>
    </div>
  );
}

export function StripeElementsShell({
  clientSecret,
  publishableKey,
  onPaid,
  onPrevious,
}: {
  clientSecret: string;
  publishableKey: string;
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentFormInner onPaid={onPaid} onPrevious={onPrevious} />
    </Elements>
  );
}

export function ProviderCheckoutShell({
  classId,
  engagementId,
  enrolmentToken,
  paymentProvider,
  mockPending,
  clientSecret,
  publishableKey,
  amountMinor,
  currency,
  mockPaymentRef,
  pageUrl,
  onPaid,
  onPrevious,
}: {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  paymentProvider?: string | null;
  mockPending?: boolean;
  clientSecret: string | null;
  publishableKey: string | null;
  amountMinor: number | null;
  currency: string | null;
  mockPaymentRef: string | null;
  pageUrl: string | null;
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();

  const isMockHostedPage = isMockHostedPaymentPage(paymentProvider, pageUrl);

  if (mockPending || paymentProvider === 'mock' || isMockHostedPage) {
    return (
      <MockPaymentShell
        classId={classId}
        engagementId={engagementId}
        enrolmentToken={enrolmentToken}
        amountMinor={amountMinor}
        currency={currency}
        mockPaymentRef={mockPaymentRef}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
  }

  if (paymentProvider === 'icount' && pageUrl) {
    return (
      <IcountPaymentShell
        engagementId={engagementId}
        pageUrl={pageUrl}
        enrolmentToken={enrolmentToken}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
  }

  if (paymentProvider === 'invoice4u' && pageUrl) {
    return (
      <Invoice4uPaymentShell
        engagementId={engagementId}
        pageUrl={pageUrl}
        enrolmentToken={enrolmentToken}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
  }

  if (paymentProvider === 'grow' && pageUrl) {
    return (
      <GrowPaymentShell
        engagementId={engagementId}
        pageUrl={pageUrl}
        enrolmentToken={enrolmentToken}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
  }

  if (!clientSecret || !publishableKey) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <StripeElementsShell
      clientSecret={clientSecret}
      publishableKey={publishableKey}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}
