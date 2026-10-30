/**
 * Simulated row-level security for the demo client. The photographer sees
 * every row in the tenant; a signed-in client sees only their own account's
 * people, shoots and payments; a signed-out visitor sees only public tables.
 * Mirrors the intent of the RLS policies, not their exact SQL.
 */
import type { DemoContext, Row } from './fakeSupabase';

const PUBLIC_TABLES = new Set(['tenants', 'offerings', 'consent_templates', 'categories', 'seasons', 'staff']);
const ADMIN_ONLY = new Set(['leads', 'audit_log', 'notification_log']);
const BY_ACCOUNT = new Set(['accounts']);
const BY_ACCOUNT_COL = new Set(['people', 'account_members']);
const BY_PERSON = new Set(['engagements', 'payments', 'contact_preferences']);
const BY_ENGAGEMENT = new Set(['job_details', 'job_payment_requests', 'waiver_evidence', 'quotes']);

function isAdmin(ctx: DemoContext): boolean {
  const profile = ctx.db.user_profiles?.find((p) => p.id === ctx.user?.id);
  return Array.isArray(profile?.role) && (profile?.role as string[]).includes('tenant_admin');
}

function scope(ctx: DemoContext) {
  const uid = ctx.user?.id;
  const accounts = new Set(
    (ctx.db.account_members ?? []).filter((m) => m.user_profile_id === uid).map((m) => m.account_id as string),
  );
  const people = new Set((ctx.db.people ?? []).filter((p) => accounts.has(p.account_id as string)).map((p) => p.id as string));
  const engagements = new Set(
    (ctx.db.engagements ?? []).filter((e) => people.has(e.person_id as string)).map((e) => e.id as string),
  );
  return { accounts, people, engagements };
}

export function canRead(table: string, row: Row, ctx: DemoContext): boolean {
  if (PUBLIC_TABLES.has(table)) return true;
  if (!ctx.user) return false;
  if (isAdmin(ctx)) return true;
  if (ADMIN_ONLY.has(table)) return false;
  if (table === 'user_profiles') return row.id === ctx.user.id;
  const s = scope(ctx);
  if (BY_ACCOUNT.has(table)) return s.accounts.has(row.id as string);
  if (BY_ACCOUNT_COL.has(table)) return s.accounts.has(row.account_id as string);
  if (BY_PERSON.has(table)) return s.people.has(row.person_id as string);
  if (BY_ENGAGEMENT.has(table)) return s.engagements.has(row.engagement_id as string);
  return true;
}
