import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/ui/button';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';

interface EnrolmentPaymentFormProps {
  classId: string;
  engagementId: string;
  /** When false, payment works without a logged-in session (guest checkout). */
  requireAuth?: boolean;
  onPaid: () => void;
  onPrevious: () => void;
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

export function EnrolmentPaymentForm({
  classId,
  engagementId,
  requireAuth = true,
  onPaid,
  onPrevious,
}: EnrolmentPaymentFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useCurrentUser();
  const tenant = useTenant();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
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

      if (error || !data?.clientSecret) {
        setLoadError(error?.message ?? data?.error ?? t('enrolment.payment_setup_failed'));
        return;
      }

      setClientSecret(data.clientSecret);
      setPublishableKey(data.publishableKey ?? tenant?.stripe_publishable_key ?? null);
    };

    void loadIntent();
  }, [requireAuth, user, classId, engagementId, tenant, t]);

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

  if (!clientSecret || !publishableKey) {
    return <p role="status">{t('common.loading')}</p>;
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentFormInner onPaid={onPaid} onPrevious={onPrevious} />
    </Elements>
  );
}
