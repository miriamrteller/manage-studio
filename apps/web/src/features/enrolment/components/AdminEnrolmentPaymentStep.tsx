import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EnrolmentPaymentForm } from './EnrolmentPaymentForm';
import {
  AdminEnrolmentService,
  type OfflinePaymentMethod,
} from '../lib/adminEnrolmentService';
import { computeClassTotal } from '../lib/computeClassTotal';
import { formatCurrency } from '@shared/format';
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
  onComplete: (result: { message: string; paymentChoice: AdminPaymentChoice }) => void;
  onPrevious?: () => void;
  emailInputId?: string;
  offlineMethodId?: string;
}

export function AdminEnrolmentPaymentStep({
  tenant,
  engagementId,
  personId,
  personName,
  familyId,
  guardianEmail,
  guardianName,
  classRow,
  onComplete,
  onPrevious,
  emailInputId = 'payment-link-email',
  offlineMethodId = 'offline-method',
}: AdminEnrolmentPaymentStepProps) {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<'choices' | 'pay_now'>('choices');
  const [linkEmail, setLinkEmail] = useState(guardianEmail ?? '');
  const [offlineMethod, setOfflineMethod] = useState<OfflinePaymentMethod>('cash');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pricing = computeClassTotal(classRow, tenant);

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

        await AdminEnrolmentService.sendPaymentLinkEmail(tenant, {
          recipientEmail: email,
          recipientName: guardianName ?? personName,
          studentName: personName,
          className: classRow.name,
          engagementId,
          totalMinor: pricing.totalMinor,
          currency: pricing.currency,
        });

        onComplete({
          message: t('pages.admin_enrol.link_sent', { email }),
          paymentChoice: choice,
        });
        return;
      }

      await AdminEnrolmentService.recordOfflinePayment(
        tenant,
        engagementId,
        classRow,
        personId,
        familyId ?? null,
        offlineMethod,
      );

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
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.admin_enrol.pay_now_inline')}</p>
        <EnrolmentPaymentForm
          classId={classRow.id}
          engagementId={engagementId}
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
          {formatCurrency(pricing.totalMinor, pricing.currency, i18n.language)}
        </p>
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
          <Button
            variant="outline"
            className="w-full"
            disabled={isSubmitting || !linkEmail.trim()}
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
            <option value="check">{t('pages.admin_enrol.method_check')}</option>
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
