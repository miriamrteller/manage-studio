import { supabase } from '@/lib/supabase';
import {
  functionInvokeErrorMessage,
  parseFunctionInvokeBody,
} from '@/lib/parseFunctionInvokeError';
import type { Tenant } from '@shared/schemas';
import type {
  BlastRecipientPreview,
  NotificationBlastFormValues,
} from '../lib/notificationBlastSchema';

export interface BlastSendResult {
  sent: number;
  failed: number;
  total: number;
  errors?: string[];
}

function blastRpcParams(
  values: Pick<
    NotificationBlastFormValues,
    'scope' | 'categoryId' | 'offeringId' | 'accountId'
  >,
) {
  return {
    p_scope: values.scope,
    p_category_id: values.scope === 'level' ? values.categoryId ?? null : null,
    p_offering_id: values.scope === 'class' ? values.offeringId ?? null : null,
    p_account_id: values.scope === 'account' ? values.accountId ?? null : null,
    p_recipient_query: null,
  };
}

export async function previewRecipients(
  values: Pick<
    NotificationBlastFormValues,
    'scope' | 'categoryId' | 'offeringId' | 'accountId'
  >,
): Promise<BlastRecipientPreview[]> {
  const { data, error } = await supabase.rpc(
    'preview_notification_blast_recipients',
    blastRpcParams(values),
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as BlastRecipientPreview[];
}

export async function sendBlast(
  tenant: Tenant,
  values: NotificationBlastFormValues,
  selectedRecipientEmails: string[],
): Promise<BlastSendResult> {
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: {
      mode: 'admin_blast',
      tenantId: tenant.id,
      scope: values.scope,
      categoryId: values.scope === 'level' ? values.categoryId : undefined,
      offeringId: values.scope === 'class' ? values.offeringId : undefined,
      accountId: values.scope === 'account' ? values.accountId : undefined,
      selectedRecipientEmails,
      subject: values.subject,
      body: values.body,
    },
  });

  const responseBody = await parseFunctionInvokeBody(data, error);

  if (error || responseBody?.error) {
    throw new Error(
      functionInvokeErrorMessage(error, responseBody, 'Failed to send notification blast'),
    );
  }

  if (!responseBody || typeof responseBody.sent !== 'number') {
    throw new Error('Unexpected response from send-notification');
  }

  return {
    sent: responseBody.sent,
    failed: typeof responseBody.failed === 'number' ? responseBody.failed : 0,
    total: typeof responseBody.total === 'number' ? responseBody.total : responseBody.sent,
    ...(Array.isArray(responseBody.errors)
      ? {
          errors: responseBody.errors.filter(
            (entry): entry is string => typeof entry === 'string',
          ),
        }
      : {}),
  };
}
