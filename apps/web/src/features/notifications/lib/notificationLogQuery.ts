import { supabase } from '@/lib/supabase';

export const RECIPIENT_NAME_SEARCH_LIMIT = 100;

export function normalizeRecipientQuery(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return undefined;
  return trimmed.replace(/[%_]/g, '\\$&');
}

export function buildRecipientFilterOrClause(
  recipientQuery: string | undefined,
  options: { personIds?: string[]; accountMemberIds?: string[] } = {},
): string | null {
  const q = normalizeRecipientQuery(recipientQuery);
  const personIds = options.personIds ?? [];
  const accountMemberIds = options.accountMemberIds ?? [];

  const parts: string[] = [];

  if (q) {
    parts.push(`recipient_email.ilike.%${q}%`, `recipient_phone.ilike.%${q}%`);
  }
  if (personIds.length > 0) {
    parts.push(`recipient_person_id.in.(${personIds.join(',')})`);
  }
  if (accountMemberIds.length > 0) {
    parts.push(`recipient_account_member_id.in.(${accountMemberIds.join(',')})`);
  }

  return parts.length > 0 ? parts.join(',') : null;
}

type OrFilterable<T> = {
  or: (filters: string) => T;
};

export function applyRecipientFilter<T extends OrFilterable<T>>(
  query: T,
  recipientQuery: string | undefined,
  options: { personIds?: string[]; accountMemberIds?: string[] } = {},
): T {
  const clause = buildRecipientFilterOrClause(recipientQuery, options);
  if (!clause) return query;
  return query.or(clause);
}

export async function searchRecipientPersonIds(
  tenantId: string,
  recipientQuery: string | undefined,
): Promise<string[]> {
  const q = normalizeRecipientQuery(recipientQuery);
  if (!q) return [];

  const { data, error } = await supabase
    .from('people')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(RECIPIENT_NAME_SEARCH_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function searchRecipientAccountMemberIds(personIds: string[]): Promise<string[]> {
  if (personIds.length === 0) return [];

  const { data, error } = await supabase
    .from('account_members')
    .select('id')
    .in('person_id', personIds)
    .limit(RECIPIENT_NAME_SEARCH_LIMIT);

  if (error) throw error;
  return (data ?? []).map((row) => row.id as string);
}

export async function resolveRecipientSearchIds(
  tenantId: string,
  recipientQuery: string | undefined,
): Promise<{ personIds: string[]; accountMemberIds: string[] }> {
  const personIds = await searchRecipientPersonIds(tenantId, recipientQuery);
  const accountMemberIds = await searchRecipientAccountMemberIds(personIds);
  return { personIds, accountMemberIds };
}
