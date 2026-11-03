import { supabase } from '@/lib/supabase';
import {
  functionInvokeErrorMessage,
  parseFunctionInvokeBody,
} from '@/lib/parseFunctionInvokeError';
import type { Tenant } from '@shared/schemas';
import { pickAccountExclusion, type AccountExclusion } from '../lib/accountExclusion';
import type {
  BlastAccountSearchResult,
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
      purpose: values.purpose ?? 'service',
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

/**
 * One account of this studio by id, labelled like a search result (for the
 * `?account=` preset). Reads with the admin's own session (RLS: their studio
 * only). Null when it doesn't exist or can't be read; never throws.
 */
export async function fetchBlastAccount(accountId: string): Promise<BlastAccountSearchResult | null> {
  try {
    const { data: account } = await supabase
      .from('accounts')
      .select('id, name, person_id')
      .eq('id', accountId)
      .maybeSingle();
    if (!account?.id) return null;
    const { data: contact } = account.person_id
      ? await supabase.from('people').select('name, email').eq('id', account.person_id).maybeSingle()
      : { data: null };
    return {
      account_id: account.id,
      account_name: account.name ?? null,
      contact_name: contact?.name ?? null,
      contact_email: contact?.email ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * For a hand-picked account: the reason its contact would not get this email, or null
 * when nothing excludes them (or the reason cannot be found). Reads with the admin's own
 * session, so only their studio's data is visible. Never throws: the preview just falls
 * back to its generic message.
 */
export async function explainAccountExclusion(
  accountId: string,
  purpose: 'service' | 'marketing',
): Promise<AccountExclusion | null> {
  try {
    const { data: account } = await supabase
      .from('accounts')
      .select('person_id')
      .eq('id', accountId)
      .maybeSingle();
    const personId = account?.person_id;
    if (!personId) return null;

    const [{ data: person }, { data: prefs }, { data: consent }] = await Promise.all([
      supabase.from('people').select('email').eq('id', personId).maybeSingle(),
      supabase
        .from('contact_preferences')
        .select('email_opted_in, notify_announcements')
        .eq('person_id', personId)
        .is('account_member_id', null)
        .maybeSingle(),
      purpose === 'marketing'
        ? supabase
            .from('consent_records')
            .select('granted')
            .eq('person_id', personId)
            .eq('kind', 'marketing_email')
            .order('created_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: null }),
    ]);

    return pickAccountExclusion({
      email: person?.email,
      emailOptedIn: prefs?.email_opted_in,
      notifyAnnouncements: prefs?.notify_announcements,
      purpose,
      marketingGranted: Boolean(consent?.[0]?.granted),
    });
  } catch {
    return null;
  }
}
