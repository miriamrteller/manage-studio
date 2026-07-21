import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { CheckoutPaymentShell } from './CheckoutPaymentShell';
import { ProviderCheckoutShell } from './EnrolmentCheckoutShells';
import type { CheckoutChargePayload } from '../lib/checkoutBootstrapTypes';
import { isHostedPageCheckoutReady } from '@/lib/tenantProviderRouting';

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
  /** Preloaded charge from prepare-enrolment-checkout — skips create-checkout call. */
  preloadedCharge?: CheckoutChargePayload | null;
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
  billingMode: string | null;
  billingInterval: string | null;
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
    const hostedPageReady = isHostedPageCheckoutReady(data?.paymentProvider, data?.pageUrl);

    if (error || (!data?.clientSecret && !mockReady && !hostedPageReady)) {
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
      billingMode: typeof data.billingMode === 'string' ? data.billingMode : null,
      billingInterval: typeof data.billingInterval === 'string' ? data.billingInterval : null,
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
    billingMode: data?.billingMode ?? null,
    billingInterval: data?.billingInterval ?? null,
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
    billingMode,
    billingInterval,
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

  const hostedPageReady = isHostedPageCheckoutReady(paymentProvider, pageUrl);

  if (
    isLoading ||
    (!mockPending && paymentProvider !== 'mock' && !hostedPageReady && (!clientSecret || !publishableKey))
  ) {
    return <p role="status">{t('common.loading')}</p>;
  }

  return (
    <ProviderCheckoutShell
      classId={classId}
      engagementId={engagementId}
      enrolmentToken={enrolmentToken}
      paymentProvider={paymentProvider}
      mockPending={mockPending}
      clientSecret={clientSecret}
      publishableKey={publishableKey}
      amountMinor={amountMinor}
      currency={currency}
      billingMode={billingMode}
      billingInterval={billingInterval}
      mockPaymentRef={mockPaymentRef}
      pageUrl={pageUrl}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}

function AuthenticatedEnrolmentPaymentForm({
  classId,
  engagementId,
  requireAuth = true,
  preloadedCharge,
  onPaid,
  onPrevious,
}: BasePaymentFormProps & { requireAuth?: boolean; preloadedCharge?: CheckoutChargePayload | null }) {
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
      !preloadedCharge &&
        classId &&
        engagementId &&
        (!requireAuth || (!authLoading && user)),
    ),
    fallbackPublishableKey:
      tenant?.payment_provider_public_key ?? tenant?.stripe_publishable_key ?? null,
  });

  if (requireAuth && (authLoading || !user)) {
    return <p role="status">{t('common.loading')}</p>;
  }

  if (preloadedCharge) {
    return (
      <CheckoutPaymentShell
        classId={classId}
        engagementId={engagementId}
        charge={preloadedCharge}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
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

function TokenEnrolmentPaymentForm({
  classId,
  engagementId,
  enrolmentToken,
  preloadedCharge,
  onPaid,
  onPrevious,
}: BasePaymentFormProps & {
  enrolmentToken: string;
  preloadedCharge?: CheckoutChargePayload | null;
}) {
  const checkout = useCheckoutIntent({
    classId,
    engagementId,
    enrolmentToken,
    enabled: Boolean(!preloadedCharge && classId && engagementId && enrolmentToken),
  });

  if (preloadedCharge) {
    return (
      <CheckoutPaymentShell
        classId={classId}
        engagementId={engagementId}
        enrolmentToken={enrolmentToken}
        charge={preloadedCharge}
        onPaid={onPaid}
        onPrevious={onPrevious}
      />
    );
  }

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

export function EnrolmentPaymentForm({
  classId,
  engagementId,
  requireAuth = true,
  enrolmentToken,
  preloadedCharge,
  onPaid,
  onPrevious,
}: EnrolmentPaymentFormProps) {
  if (enrolmentToken) {
    return (
      <TokenEnrolmentPaymentForm
        classId={classId}
        engagementId={engagementId}
        enrolmentToken={enrolmentToken}
        preloadedCharge={preloadedCharge}
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
      preloadedCharge={preloadedCharge}
      onPaid={onPaid}
      onPrevious={onPrevious}
    />
  );
}
