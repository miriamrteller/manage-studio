import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentForm } from './EnrolmentPaymentForm';
import { useCheckoutBootstrap } from '../hooks/useCheckoutBootstrap';
import type { CheckoutChargePayload } from '../lib/checkoutBootstrapTypes';
import {
  AdminEnrolmentService,
  type OfflinePaymentMethod,
} from '../lib/adminEnrolmentService';
import { computeClassTotal } from '../lib/computeClassTotal';
import { formatOfferingPrice } from '@/lib/formatOfferingPrice';
import type { Offering, Tenant } from '@shared/schemas';

export type AdminPaymentChoice = 'pay_now' | 'send_link' | 'offline';

export interface AdminEnrolmentPaymentStepProps {
  tenant: Tenant;
  engagementId: string;
  personId: string;
  personName: string;
  familyId?: string | null;
  guardianEmail?: string | null;
  guardianName?: string | null;
  classRow: Offering;
  onComplete: (result: {
    message: string;
    paymentChoice: AdminPaymentChoice;
    paymentUrl?: string;
    emailSent?: boolean;
    warning?: string;
  }) => void;
  onPrevious?: () => void;
  emailInputId?: string;
  offlineMethodId?: string;
  preloadedCharge?: CheckoutChargePayload | null;
}

export function AdminEnrolmentPaymentStep({
  tenant,
  engagementId,
  personName,
  guardianEmail,
  guardianName,
  classRow,
  onComplete,
  onPrevious,
  emailInputId = 'payment-link-email',
  offlineMethodId = 'offline-method',
  preloadedCharge = null,
}: AdminEnrolmentPaymentStepProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'choices' | 'pay_now'>('choices');
  const [linkEmail, setLinkEmail] = useState(guardianEmail ?? '');
  const [overrideReason, setOverrideReason] = useState('');
  const [offlineMethod, setOfflineMethod] = useState<OfflinePaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const guardianEmailNormalized = guardianEmail?.toLowerCase() ?? '';

  const pricing = computeClassTotal(classRow, tenant);

  const payBootstrap = useCheckoutBootstrap({
    phase: 'pay',
    mode: 'existing_engagement',
    engagementId,
    offeringId: classRow.id,
    enabled: view === 'pay_now' && !preloadedCharge,
  });

  const effectiveCharge = preloadedCharge ?? payBootstrap.charge;

  const handlePaymentChoice = async (choice: AdminPaymentChoice) => {
    setError(null);
    setIsSubmitting(true);

    try {
      if (choice === 'pay_now') {
        setView('pay_now');
        return;
      }

      if (choice === 'send_link') {
        const email = linkEmail.trim();
        if (!email) {
          setError(t('pages.admin_enrol.email_required'));
          return;
        }

        const completion = await AdminEnrolmentService.sendPaymentLinkEmail(tenant, {
          recipientEmail: email,
          recipientName: guardianName ?? personName,
          overrideReason: email.toLowerCase() !== (guardianEmail ?? '').toLowerCase() ? overrideReason.trim() : undefined,
          studentName: personName,
          className: classRow.name,
          engagementId,
          totalMinor: pricing.totalMinor,
          currency: pricing.currency,
        });

        onComplete({
          message: completion.emailSent
            ? t('pages.admin_enrol.link_sent', { email })
            : t('pages.admin_enrol.link_not_emailed', {
                email,
                defaultValue:
                  'Completion link was created but email delivery failed. Copy the link below and send it manually.',
              }),
          paymentChoice: choice,
          paymentUrl: completion.paymentUrl,
          emailSent: completion.emailSent,
          warning: completion.warning,
        });
        return;
      }

      await AdminEnrolmentService.recordOfflinePayment(engagementId, offlineMethod);

      onComplete({
        message: t('pages.admin_enrol.offline_recorded'),
        paymentChoice: choice,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === 'pay_now') {
    if (!preloadedCharge && payBootstrap.isLoading) {
      return (
        <div className="space-y-4">
          <p role="status">{t('common.loading')}</p>
        </div>
      );
    }

    if (!effectiveCharge) {
      return (
        <div className="space-y-4">
          <p className="text-sm text-destructive" role="alert">
            {payBootstrap.loadError ?? t('enrolment.payment_setup_failed')}
          </p>
          <Button variant="outline" onClick={() => setView('choices')}>
            {t('common.back')}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.admin_enrol.pay_now_inline')}</p>
        <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
          <p className="font-medium">{classRow.name}</p>
          <p className="text-gray-600">
            {t('pages.admin_enrol.amount_due')}:{' '}
            {formatOfferingPrice(t, pricing.totalMinor, pricing.currency, i18n.language, classRow)}
          </p>
          {classRow.billing_mode === 'recurring' && classRow.billing_interval === 'monthly' && (
            <p className="text-xs text-gray-500">{t('enrolment.checkout_monthly_hint')}</p>
          )}
        </div>
        <EnrolmentPaymentForm
          classId={classRow.id}
          engagementId={engagementId}
          preloadedCharge={effectiveCharge}
          onPaid={() =>
            onComplete({
              message: t('pages.admin_enrol.payment_success'),
              paymentChoice: 'pay_now',
            })
          }
          onPrevious={() => setView('choices')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gray-50 p-3 text-sm">
        <p className="font-medium">{classRow.name}</p>
        <p className="text-gray-600 mt-1">
          {t('pages.admin_enrol.amount_due')}:{' '}
          {formatOfferingPrice(t, pricing.totalMinor, pricing.currency, i18n.language, classRow)}
        </p>
        {classRow.billing_mode === 'recurring' && classRow.billing_interval === 'monthly' && (
          <p className="text-xs text-gray-500 mt-1">{t('enrolment.checkout_monthly_hint')}</p>
        )}
      </div>

      <p className="text-sm text-gray-600">{t('pages.admin_enrol.payment_desc')}</p>

      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start p-4 h-auto"
          disabled={isSubmitting}
          onClick={() => void handlePaymentChoice('pay_now')}
        >
          <div>
            <p className="font-semibold">{t('pages.admin_enrol.pay_now_title')}</p>
            <p className="text-sm text-gray-500">{t('pages.admin_enrol.pay_now_desc')}</p>
          </div>
        </Button>

        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div>
            <p className="font-semibold">{t('pages.admin_enrol.send_link_title')}</p>
            <p className="text-sm text-gray-500">{t('pages.admin_enrol.send_link_desc')}</p>
          </div>
          <label className="block text-sm font-medium" htmlFor={emailInputId}>
            {t('pages.admin_enrol.recipient_email')}
          </label>
          <input
            id={emailInputId}
            type="email"
            className="form-input w-full"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            placeholder={t('pages.admin_enrol.recipient_email_placeholder')}
          />
          {guardianEmail && linkEmail.trim() && linkEmail.trim().toLowerCase() !== guardianEmail.toLowerCase() && (
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor={`${emailInputId}-override-reason`}>
                {t('pages.admin_enrol.override_reason', { defaultValue: 'Reason for using a different email' })}
              </label>
              <input
                id={`${emailInputId}-override-reason`}
                type="text"
                className="form-input w-full"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('pages.admin_enrol.override_reason_placeholder', { defaultValue: 'Parent requested alternate email' })}
              />
            </div>
          )}
          <Button
            variant="outline"
            className="w-full"
            disabled={
              isSubmitting ||
              !linkEmail.trim() ||
              (Boolean(guardianEmail) &&
                linkEmail.trim().toLowerCase() !== guardianEmailNormalized &&
                !overrideReason.trim())
            }
            onClick={() => void handlePaymentChoice('send_link')}
          >
            {t('pages.admin_enrol.send_link_action')}
          </Button>
        </div>

        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div>
            <p className="font-semibold">{t('pages.admin_enrol.offline_title')}</p>
            <p className="text-sm text-gray-500">{t('pages.admin_enrol.offline_desc')}</p>
          </div>
          <label className="block text-sm font-medium" htmlFor={offlineMethodId}>
            {t('pages.admin_enrol.offline_method')}
          </label>
          <select
            id={offlineMethodId}
            className="form-input w-full"
            value={offlineMethod}
            onChange={(e) => setOfflineMethod(e.target.value as OfflinePaymentMethod)}
          >
            <option value="cash">{t('pages.admin_enrol.method_cash')}</option>
            <option value="bank_transfer">{t('pages.admin_enrol.method_bank')}</option>
          </select>
          <Button
            variant="outline"
            className="w-full"
            disabled={isSubmitting}
            onClick={() => void handlePaymentChoice('offline')}
          >
            {t('pages.admin_enrol.offline_action')}
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {onPrevious && (
        <Button variant="outline" className="w-full" onClick={onPrevious}>
          {t('common.back')}
        </Button>
      )}
    </div>
  );
}
