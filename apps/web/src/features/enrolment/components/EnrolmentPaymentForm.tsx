import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';

interface EnrolmentPaymentFormProps {
  classId: string;
  enrolmentId: string;
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
        <button
          type="button"
          onClick={onPrevious}
          disabled={isPaying}
          className="flex-1 px-4 py-2 border border-border rounded"
        >
          {t('common.back')}
        </button>
        <button
          type="button"
          onClick={handlePay}
          disabled={isPaying || !stripe}
          className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          {isPaying ? t('common.loading') : t('enrolment.pay_now')}
        </button>
      </div>
    </div>
  );
}

export function EnrolmentPaymentForm({
  classId,
  enrolmentId,
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
    if (!authLoading && !user) {
      navigate('/login', { state: { from: '/classes' }, replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !enrolmentId || !classId) return;

    const loadIntent = async () => {
      const { data, error } = await supabase.functions.invoke('create-payment-intent', {
        body: { class_id: classId, enrolment_id: enrolmentId },
      });

      if (error || !data?.clientSecret) {
        setLoadError(error?.message ?? data?.error ?? t('enrolment.payment_setup_failed'));
        return;
      }

      setClientSecret(data.clientSecret);
      setPublishableKey(data.publishableKey ?? tenant?.stripe_publishable_key ?? null);
    };

    void loadIntent();
  }, [user, classId, enrolmentId, tenant, t]);

  if (authLoading || !user) {
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
