import { TenantDB } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { Offering, Engagement, Tenant } from '@shared/schemas';
import { EnrolmentService } from '../service';
import { computeClassTotal } from './computeClassTotal';

export type OfflinePaymentMethod = 'cash' | 'check' | 'bank_transfer';
export interface SendCompletionLinkResult {
  paymentUrl: string;
  emailSent: boolean;
  warning?: string;
}

export interface SendWaiverLinkResult {
  signUrl: string;
  emailSent: boolean;
  warning?: string;
}

export function buildPaymentLink(engagementId: string, token?: string): string {
  const base = `${window.location.origin}/enrol/pay/${engagementId}`;
  if (!token) return base;
  return `${base}?t=${encodeURIComponent(token)}`;
}

export function buildWaiverLink(engagementId: string, token?: string): string {
  const base = `${window.location.origin}/enrol/complete?engagementId=${encodeURIComponent(engagementId)}`;
  if (!token) return base;
  return `${base}&wt=${encodeURIComponent(token)}`;
}

export class AdminEnrolmentService {
  /** Mark enrolment active (or pending_waiver) and record an offline payment (admin in-person). */
  static async recordOfflinePayment(
    tenant: Tenant,
    engagementId: string,
    classRow: Pick<Offering, 'price_minor' | 'currency' | 'waiver_required'>,
    personId: string,
    accountId: string | null,
    paymentMethod: OfflinePaymentMethod,
  ): Promise<Engagement> {
    const { pretaxMinor, vatMinor, totalMinor, vatRate, currency } = computeClassTotal(
      classRow,
      tenant,
    );
    const paidAt = new Date().toISOString();

    // Waiver gate: engagement-scoped evidence only
    let targetStatus: 'active' | 'pending_waiver' = 'active';
    if (classRow.waiver_required) {
      const { data: engagementRow, error: engagementError } = await TenantDB.selectFor('engagements', tenant)
        .select('waiver_evidence_id')
        .eq('id', engagementId)
        .maybeSingle();
      if (engagementError) throw engagementError;
      if (!engagementRow?.waiver_evidence_id) {
        targetStatus = 'pending_waiver';
      }
    }

    const enrolment = await EnrolmentService.update(tenant, engagementId, {
      status: targetStatus,
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
      overrideReason?: string;
      studentName: string;
      className: string;
      engagementId: string;
      totalMinor: number;
      currency: string;
    },
  ): Promise<SendCompletionLinkResult> {
    const { data, error } = await supabase.functions.invoke('send-admin-enrolment-link', {
      body: {
        tenantId: tenant.id,
        engagementId: options.engagementId,
        recipientEmail: options.recipientEmail,
        recipientName: options.recipientName,
        overrideReason: options.overrideReason,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to send payment link email');
    }

    if (data && (data as { success?: boolean }).success === false) {
      throw new Error(data.failureReason || 'Failed to send payment link email');
    }

    const typed = (data as { paymentUrl?: string; emailSent?: boolean; warning?: string } | null) ?? null;
    return {
      paymentUrl: typed?.paymentUrl ?? buildPaymentLink(options.engagementId),
      emailSent: typed?.emailSent !== false,
      warning: typed?.warning,
    };
  }

  /** Email a waiver signing link for a pending_waiver enrolment. */
  static async sendWaiverLinkEmail(
    tenant: Tenant,
    options: {
      recipientEmail: string;
      recipientName: string;
      overrideReason?: string;
      engagementId: string;
    },
  ): Promise<SendWaiverLinkResult> {
    const { data, error } = await supabase.functions.invoke('send-admin-waiver-link', {
      body: {
        tenantId: tenant.id,
        engagementId: options.engagementId,
        recipientEmail: options.recipientEmail,
        recipientName: options.recipientName,
        overrideReason: options.overrideReason,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to send waiver link email');
    }

    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }

    const typed = (data as { signUrl?: string; emailSent?: boolean; warning?: string } | null) ?? null;
    return {
      signUrl: typed?.signUrl ?? buildWaiverLink(options.engagementId),
      emailSent: typed?.emailSent !== false,
      warning: typed?.warning,
    };
  }
}
