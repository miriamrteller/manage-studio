import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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

/** Token-based checkout — no session or tenant hooks. */
export function TokenEnrolmentPaymentForm({
  classId,
  engagementId,
  enrolmentToken,
  onPaid,
  onPrevious,
}: BasePaymentFormProps & { enrolmentToken: string }) {
  const { t } = useTranslation();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [mockCompleted, setMockCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagementId || !classId || !enrolmentToken) return;

    const loadIntent = async () => {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { offering_id: classId, engagement_id: engagementId, enrolment_token: enrolmentToken },
        headers: { Authorization: `WaiverToken ${enrolmentToken}` },
      });

      if (error || (!data?.clientSecret && !data?.mockCompleted)) {
        setLoadError(error?.message ?? data?.error ?? t('enrolment.payment_setup_failed'));
        return;
      }

      setClientSecret(data.clientSecret ?? null);
      setPublishableKey(data.publishableKey ?? null);
      setPaymentProvider(data.paymentProvider ?? null);
      setMockCompleted(Boolean(data.mockCompleted));
    };

    void loadIntent();
  }, [classId, engagementId, enrolmentToken, t]);

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    );
  }

  if (!mockCompleted && paymentProvider !== 'mock' && (!clientSecret || !publishableKey)) {
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<string | null>(null);
  const [mockCompleted, setMockCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (requireAuth && !authLoading && !user) {
      navigate('/login', { state: { from: '/classes' }, replace: true });
    }
  }, [requireAuth, authLoading, user, navigate]);

  useEffect(() => {
    if (requireAuth && !user) return;
    if (!engagementId || !classId) return;

    const loadIntent = async () => {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { offering_id: classId, engagement_id: engagementId },
      });

      if (error || (!data?.clientSecret && !data?.mockCompleted)) {
        setLoadError(error?.message ?? data?.error ?? t('enrolment.payment_setup_failed'));
        return;
      }

      setClientSecret(data.clientSecret ?? null);
      setPublishableKey(
        data.publishableKey ?? tenant?.payment_provider_public_key ?? tenant?.stripe_publishable_key ?? null,
      );
      setPaymentProvider(data.paymentProvider ?? null);
      setMockCompleted(Boolean(data.mockCompleted));
    };

    void loadIntent();
  }, [
    requireAuth,
    user,
    classId,
    engagementId,
    tenant?.payment_provider_public_key,
    tenant?.stripe_publishable_key,
    t,
  ]);

  if (requireAuth && (authLoading || !user)) {
    return <p role="status">{t('common.loading')}</p>;
  }

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    );
  }

  if (!mockCompleted && paymentProvider !== 'mock' && (!clientSecret || !publishableKey)) {
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
