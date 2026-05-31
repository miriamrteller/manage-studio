import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Offering, Engagement, Tenant } from '@shared/schemas';
import { EnrolmentService } from '../service';
import { computeClassTotal } from './computeClassTotal';

export type OfflinePaymentMethod = 'cash' | 'check' | 'bank_transfer';

export function buildPaymentLink(engagementId: string): string {
  return `${window.location.origin}/enrol/pay/${engagementId}`;
}

export class AdminEnrolmentService {
  /** Mark enrolment active and record an offline payment (admin in-person). */
  static async recordOfflinePayment(
    tenant: Tenant,
    engagementId: string,
    classRow: Pick<Offering, 'price_minor' | 'currency'>,
    personId: string,
    accountId: string | null,
    paymentMethod: OfflinePaymentMethod,
  ): Promise<Engagement> {
    const { pretaxMinor, vatMinor, totalMinor, vatRate, currency } = computeClassTotal(
      classRow,
      tenant,
    );
    const paidAt = new Date().toISOString();

    const enrolment = await EnrolmentService.update(tenant, engagementId, {
      status: 'active',
      payment_received_at: paidAt,
    });

    const { error: paymentError } = await TenantDB.insert('payments', tenant, {
      account_id: accountId,
      person_id: personId,
      engagement_id: engagementId,
      pretax_amount_minor: pretaxMinor,
      vat_rate: vatRate,
      vat_amount_minor: vatMinor,
      total_amount_minor: totalMinor,
      currency,
      status: 'succeeded',
      paid_at: paidAt,
      description: `Offline ${paymentMethod} — enrolment ${engagementId}`,
    });

    if (paymentError) {
      throw paymentError;
    }

    return enrolment;
  }

  /** Email a payment link for a pending_payment enrolment. */
  static async sendPaymentLinkEmail(
    tenant: Tenant,
    options: {
      recipientEmail: string;
      recipientName: string;
      studentName: string;
      className: string;
      engagementId: string;
      totalMinor: number;
      currency: string;
    },
  ): Promise<void> {
    const paymentUrl = buildPaymentLink(options.engagementId);
    const amountFormatted = (options.totalMinor / 100).toLocaleString(undefined, {
      style: 'currency',
      currency: options.currency,
    });

    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: {
        tenantId: tenant.id,
        recipientEmail: options.recipientEmail,
        templateName: 'payment_reminder',
        channel: 'email',
        variables: {
          subject: `Payment required — ${options.className}`,
          recipientName: options.recipientName,
          enrolledClassName: options.className,
          description: `${options.studentName} — ${options.className}`,
          amount: amountFormatted,
          amountOutstandingFormatted: amountFormatted,
          amountFormatted,
          paymentUrl,
          dueDate: '—',
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to send payment link email');
    }

    if (data && data.success === false) {
      throw new Error(data.failureReason || 'Failed to send payment link email');
    }
  }
}
