import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import {
  functionInvokeErrorMessage,
  parseFunctionInvokeBody,
} from '@/lib/parseFunctionInvokeError';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { formatCurrency } from '@shared/format';
import { GrowPaymentShell } from './GrowPaymentShell';

interface BasePaymentFormProps {
  classId: string;
  engagementId: string;
  onPaid: () => void;
  onPrevious: () => void;
}

interface EnrolmentPaymentFormProps extends BasePaymentFormProps {
  /** When false, payment works without a logged-in session (guest checkout). */
  requireAuth?: boolean;
  /** Token for unauthenticated enrolment checkout actions. */
  enrolmentToken?: string;
}

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

function MockPaymentShell({
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

    // The outcome is driven entirely by the typed card number: the decline test card maps to a
    // declined payment, anything else succeeds. We intentionally do NOT send an explicit scenario
    // so the server can't be forced to "success" while the user typed the decline card.
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

function StripeElementsShell({
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

interface CheckoutIntentData {
  clientSecret: string | null;
  publishableKey: string | null;
  paymentProvider: string | null;
  mockCompleted: boolean;
  mockPending: boolean;
  amountMinor: number | null;
  currency: string | null;
  mockPaymentRef: string | null;
  pageUrl: string | null;
  pendingWebhook: boolean;
}

interface CheckoutIntentState extends CheckoutIntentData {
  loadError: string | null;
  isLoading: boolean;
}

const checkoutIntentInflight = new Map<string, Promise<CheckoutIntentData>>();

async function fetchCheckoutIntent(input: {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  fallbackPublishableKey?: string | null;
  setupFailedMessage: string;
}): Promise<CheckoutIntentData> {
  const cacheKey = `${input.engagementId}:${input.classId}:${input.enrolmentToken ?? ''}`;
  const inflight = checkoutIntentInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: {
        offering_id: input.classId,
        engagement_id: input.engagementId,
        ...(input.enrolmentToken ? { enrolment_token: input.enrolmentToken } : {}),
      },
      ...(input.enrolmentToken
        ? { headers: { Authorization: `WaiverToken ${input.enrolmentToken}` } }
        : {}),
    });

    const mockReady =
      Boolean(data?.mockCompleted) ||
      Boolean(data?.mockPending) ||
      data?.paymentProvider === 'mock';
    const growReady = data?.paymentProvider === 'grow' && Boolean(data?.pageUrl);

    if (error || (!data?.clientSecret && !mockReady && !growReady)) {
      throw new Error(
        error?.message ??
          (typeof data?.error === 'string' ? data.error : null) ??
          input.setupFailedMessage,
      );
    }

    return {
      clientSecret: data.clientSecret ?? null,
      publishableKey: data.publishableKey ?? input.fallbackPublishableKey ?? null,
      paymentProvider: data.paymentProvider ?? null,
      mockCompleted: Boolean(data.mockCompleted),
      mockPending: Boolean(data.mockPending),
      amountMinor: typeof data.amountMinor === 'number' ? data.amountMinor : null,
      currency: typeof data.currency === 'string' ? data.currency : null,
      mockPaymentRef: typeof data.paymentIntentId === 'string' ? data.paymentIntentId : null,
      pageUrl: typeof data.pageUrl === 'string' ? data.pageUrl : null,
      pendingWebhook: Boolean(data.pendingWebhook),
    };
  })();

  checkoutIntentInflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    checkoutIntentInflight.delete(cacheKey);
  }
}

function useCheckoutIntent({
  classId,
  engagementId,
  enabled,
  enrolmentToken,
  fallbackPublishableKey,
}: {
  classId: string;
  engagementId: string;
  enabled: boolean;
  enrolmentToken?: string;
  fallbackPublishableKey?: string | null;
}): CheckoutIntentState {
  const { t } = useTranslation();
  const queryEnabled = enabled && Boolean(classId && engagementId);

  const { data, error, isPending } = useQuery({
    queryKey: ['checkout-intent', engagementId, classId, enrolmentToken ?? null],
    queryFn: () =>
      fetchCheckoutIntent({
        classId,
        engagementId,
        enrolmentToken,
        fallbackPublishableKey,
        setupFailedMessage: t('enrolment.payment_setup_failed'),
      }),
    enabled: queryEnabled,
    staleTime: Infinity,
    retry: false,
  });

  return {
    clientSecret: data?.clientSecret ?? null,
    publishableKey: data?.publishableKey ?? null,
    paymentProvider: data?.paymentProvider ?? null,
    mockCompleted: data?.mockCompleted ?? false,
    mockPending: data?.mockPending ?? false,
    amountMinor: data?.amountMinor ?? null,
    currency: data?.currency ?? null,
    mockPaymentRef: data?.mockPaymentRef ?? null,
    pageUrl: data?.pageUrl ?? null,
    pendingWebhook: data?.pendingWebhook ?? false,
    loadError: error?.message ?? null,
    isLoading: queryEnabled && isPending,
  };
}

function CheckoutIntentShell({
  classId,
  engagementId,
  enrolmentToken,
  checkout,
  onPaid,
  onPrevious,
}: {
  classId: string;
  engagementId: string;
  enrolmentToken?: string;
  checkout: CheckoutIntentState;
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();
  const {
    clientSecret,
    publishableKey,
    paymentProvider,
    mockCompleted,
    mockPending,
    amountMinor,
    currency,
    mockPaymentRef,
    pageUrl,
    loadError,
    isLoading,
  } = checkout;

  useEffect(() => {
    if (mockCompleted) {
      onPaid();
    }
  }, [mockCompleted, onPaid]);

  if (mockCompleted) {
    return <p role="status">{t('common.loading')}</p>;
  }

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    );
  }

  const growReady = paymentProvider === 'grow' && Boolean(pageUrl);

  if (
    isLoading ||
    (!mockPending && paymentProvider !== 'mock' && !growReady && (!clientSecret || !publishableKey))
  ) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <CheckoutShell
      classId={classId}
      engagementId={engagementId}
      enrolmentToken={enrolmentToken}
      paymentProvider={paymentProvider}
      mockPending={mockPending}
      clientSecret={clientSecret}
      publishableKey={publishableKey}
      amountMinor={amountMinor}
      currency={currency}
      mockPaymentRef={mockPaymentRef}
      pageUrl={pageUrl}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}

/** Token-based checkout — no session or tenant hooks. */
export function TokenEnrolmentPaymentForm({
  classId,
  engagementId,
  enrolmentToken,
  onPaid,
  onPrevious,
}: BasePaymentFormProps & { enrolmentToken: string }) {
  const checkout = useCheckoutIntent({
    classId,
    engagementId,
    enrolmentToken,
    enabled: Boolean(classId && engagementId && enrolmentToken),
  });

  return (
    <CheckoutIntentShell
      classId={classId}
      engagementId={engagementId}
      enrolmentToken={enrolmentToken}
      checkout={checkout}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}

function CheckoutShell({
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

  const isMockGrowPage =
    paymentProvider === 'grow' && Boolean(pageUrl?.includes('mock.grow.local'));

  if (mockPending || paymentProvider === 'mock' || isMockGrowPage) {
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

function AuthenticatedEnrolmentPaymentForm({
  classId,
  engagementId,
  requireAuth = true,
  onPaid,
  onPrevious,
}: BasePaymentFormProps & { requireAuth?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useCurrentUser();
  const tenant = useTenant();

  useEffect(() => {
    if (requireAuth && !authLoading && !user) {
      navigate('/login', { state: { from: '/classes' }, replace: true });
    }
  }, [requireAuth, authLoading, user, navigate]);

  const checkout = useCheckoutIntent({
    classId,
    engagementId,
    enabled: Boolean(
      classId && engagementId && (!requireAuth || (!authLoading && user)),
    ),
    fallbackPublishableKey:
      tenant?.payment_provider_public_key ?? tenant?.stripe_publishable_key ?? null,
  });

  if (requireAuth && (authLoading || !user)) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <CheckoutIntentShell
      classId={classId}
      engagementId={engagementId}
      checkout={checkout}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}

export function EnrolmentPaymentForm({
  classId,
  engagementId,
  requireAuth = true,
  enrolmentToken,
  onPaid,
  onPrevious,
}: EnrolmentPaymentFormProps) {
  if (enrolmentToken) {
    return (
      <TokenEnrolmentPaymentForm
        classId={classId}
        engagementId={engagementId}
        enrolmentToken={enrolmentToken}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
  }

  return (
    <AuthenticatedEnrolmentPaymentForm
      classId={classId}
      engagementId={engagementId}
      requireAuth={requireAuth}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}
