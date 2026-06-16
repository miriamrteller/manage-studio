import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';

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

function MockPaymentShell({
  onPaid,
  onPrevious,
}: {
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('enrolment.mock_payment_hint', { defaultValue: 'Mock provider — payment completes on the server when you continue.' })}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onPrevious}>
          {t('common.back')}
        </Button>
        <Button type="button" variant="primary" className="flex-1" onClick={onPaid}>
          {t('enrolment.mock_pay_simulate', { defaultValue: 'Simulate payment' })}
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

    if (error || (!data?.clientSecret && !data?.mockCompleted)) {
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
    loadError: error?.message ?? null,
    isLoading: queryEnabled && isPending,
  };
}

function CheckoutIntentShell({
  checkout,
  onPaid,
  onPrevious,
}: {
  checkout: CheckoutIntentState;
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();
  const { clientSecret, publishableKey, paymentProvider, mockCompleted, loadError, isLoading } =
    checkout;

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    );
  }

  if (
    isLoading ||
    (!mockCompleted && paymentProvider !== 'mock' && (!clientSecret || !publishableKey))
  ) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <CheckoutShell
      paymentProvider={paymentProvider}
      mockCompleted={mockCompleted}
      clientSecret={clientSecret}
      publishableKey={publishableKey}
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

  return <CheckoutIntentShell checkout={checkout} onPaid={onPaid} onPrevious={onPrevious} />;
}

function CheckoutShell({
  paymentProvider,
  mockCompleted,
  clientSecret,
  publishableKey,
  onPaid,
  onPrevious,
}: {
  paymentProvider?: string | null;
  mockCompleted?: boolean;
  clientSecret: string | null;
  publishableKey: string | null;
  onPaid: () => void;
  onPrevious: () => void;
}) {
  const { t } = useTranslation();

  if (mockCompleted || paymentProvider === 'mock') {
    return <MockPaymentShell onPaid={onPaid} onPrevious={onPrevious} />;
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

  return <CheckoutIntentShell checkout={checkout} onPaid={onPaid} onPrevious={onPrevious} />;
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
