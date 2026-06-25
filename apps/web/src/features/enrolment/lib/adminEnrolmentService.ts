import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';

export type OfflinePaymentMethod = 'cash' | 'bank_transfer';
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
  /**
   * Record an admin in-person offline payment via the canonical record-payment edge
   * function (payment insert → finalise-payment → document enqueue). The edge function
   * resolves pricing, billing account, and waiver-gated activation server-side.
   */
  static async recordOfflinePayment(
    engagementId: string,
    paymentMethod: OfflinePaymentMethod,
    note?: string,
  ): Promise<{ paymentId: string }> {
    const { data, error } = await supabase.functions.invoke('record-payment', {
      body: {
        engagement_id: engagementId,
        method: paymentMethod,
        note: note || undefined,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to record offline payment');
    }
    if (data && typeof data === 'object' && 'error' in data && data.error) {
      throw new Error(String(data.error));
    }

    return { paymentId: (data as { paymentId?: string } | null)?.paymentId ?? '' };
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
      skipNotificationEmail?: boolean;
    },
  ): Promise<SendCompletionLinkResult> {
    const { data, error } = await supabase.functions.invoke('send-admin-enrolment-link', {
      body: {
        tenantId: tenant.id,
        engagementId: options.engagementId,
        recipientEmail: options.recipientEmail,
        recipientName: options.recipientName,
        overrideReason: options.overrideReason,
        skipNotificationEmail: options.skipNotificationEmail,
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
