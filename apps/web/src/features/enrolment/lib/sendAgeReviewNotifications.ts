import { supabase } from '@/lib/supabase';
import type { Tenant } from '@shared/schemas';
import { EMAIL_TEMPLATE_NAMES } from '@shared/i18n/email';
import { AdminEnrolmentService, buildPaymentLink } from './adminEnrolmentService';

async function sendEmailNotification(input: {
  tenantId: string;
  recipientEmail?: string;
  templateName: string;
  variables: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.functions.invoke('send-notification', {
    body: {
      tenantId: input.tenantId,
      recipientEmail: input.recipientEmail,
      templateName: input.templateName,
      channel: 'email',
      variables: input.variables,
    },
  });

  if (error) {
    console.error('[sendAgeReviewNotifications]', error.message);
  }
}

export async function notifyAdminsAgeReviewSubmitted(
  tenant: Tenant,
  input: {
    engagementId: string;
    studentName: string;
    className: string;
    studentAge: number | null;
    classAgeRange: string | null;
    parentNote: string;
  },
): Promise<void> {
  await sendEmailNotification({
    tenantId: tenant.id,
    templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_REQUESTED,
    variables: {
      engagementId: input.engagementId,
      studentName: input.studentName,
      className: input.className,
      studentAge: input.studentAge ?? undefined,
      classAgeRange: input.classAgeRange ?? undefined,
      parentNote: input.parentNote,
    },
  });
}

export async function notifyParentAgeReviewApproved(
  tenant: Tenant,
  input: {
    engagementId: string;
    recipientEmail: string;
    recipientName: string;
    studentName: string;
    className: string;
  },
): Promise<void> {
  let payUrl = buildPaymentLink(input.engagementId);

  try {
    const linkResult = await AdminEnrolmentService.sendPaymentLinkEmail(tenant, {
      engagementId: input.engagementId,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      studentName: input.studentName,
      className: input.className,
      totalMinor: 0,
      currency: tenant.currency,
      skipNotificationEmail: true,
    });
    if (linkResult.paymentUrl) {
      payUrl = linkResult.paymentUrl;
    }
  } catch (err) {
    console.warn('[notifyParentAgeReviewApproved] payment link fallback', err);
  }

  await sendEmailNotification({
    tenantId: tenant.id,
    recipientEmail: input.recipientEmail,
    templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_APPROVED,
    variables: {
      studentName: input.studentName,
      className: input.className,
      payUrl,
      recipientName: input.recipientName,
    },
  });
}

export async function notifyParentAgeReviewDeclined(
  tenant: Tenant,
  input: {
    recipientEmail: string;
    recipientName: string;
    studentName: string;
    className: string;
    declineReason?: string | null;
  },
): Promise<void> {
  await sendEmailNotification({
    tenantId: tenant.id,
    recipientEmail: input.recipientEmail,
    templateName: EMAIL_TEMPLATE_NAMES.ENROLMENT_AGE_REVIEW_DECLINED,
    variables: {
      studentName: input.studentName,
      className: input.className,
      recipientName: input.recipientName,
      declineReason: input.declineReason ?? undefined,
    },
  });
}
