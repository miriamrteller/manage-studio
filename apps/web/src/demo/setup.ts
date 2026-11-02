/**
 * Demo handlers for studio setup screens: the legal-pack confirmation
 * (Settings → Legal, Finish setup) and the YPay connect form (Settings →
 * Payments). Nothing is sent or stored outside the browser; credentials typed
 * into the demo are not kept.
 */
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row, type RpcHandler } from './fakeSupabase';

function rows(ctx: DemoContext, table: string): Row[] {
  return ctx.db[table] ?? (ctx.db[table] = []);
}

/** The signed-in studio admin's tenant, as the SQL functions check it. */
function adminTenant(ctx: DemoContext): Row {
  const profile = rows(ctx, 'user_profiles').find((p) => p.id === ctx.user?.id);
  const roles = (profile?.role as string[] | undefined) ?? [];
  if (!profile?.tenant_id || !roles.includes('tenant_admin')) {
    throw new DemoRpcError('only a studio admin can do this');
  }
  const tenant = rows(ctx, 'tenants').find((t) => t.id === profile.tenant_id);
  if (!tenant) throw new DemoRpcError('Tenant not found');
  return tenant;
}

export const setupRpcs: Record<string, RpcHandler> = {
  /** acknowledge_studio_legal_pack: records the confirmation and publishes the documents. */
  acknowledge_studio_legal_pack: (args, ctx) => {
    const tenant = adminTenant(ctx);
    const version = typeof args.p_version === 'string' ? args.p_version.trim() : '';
    if (!version || version.length > 64) throw new DemoRpcError('version is required');
    if (args.p_language !== 'he' && args.p_language !== 'en') throw new DemoRpcError('language must be he or en');
    const now = new Date().toISOString();
    rows(ctx, 'legal_acceptances').push({
      id: crypto.randomUUID(),
      tenant_id: tenant.id,
      user_id: ctx.user?.id,
      document: 'studio_legal_pack',
      document_version: version,
      language: args.p_language,
      accepted_by_role: 'tenant_admin',
      created_at: now,
    });
    tenant.legal_pack_acknowledged_at = now;
    tenant.legal_pages_published = true;
    tenant.legal_profile_updated_at = now;
    return now;
  },

  /** save_tenant_ypay_credentials: the demo marks YPay as connected but keeps no secret. */
  save_tenant_ypay_credentials: (args, ctx) => {
    const tenant = adminTenant(ctx);
    if (!String(args.p_client_id ?? '').trim() || !String(args.p_client_secret ?? '').trim()) {
      throw new DemoRpcError('client id and secret are required');
    }
    tenant.ypay_credentials_set = true;
    return null;
  },
};

export const setupFunctions: Record<string, FunctionHandler> = {
  /** provision-studio: only the "add the signed form if missing" step runs in the demo. */
  'provision-studio': (body, ctx) => {
    adminTenant(ctx);
    if (body.action === 'ensure_signed_template') return { ok: true };
    return { error: 'Creating studios is not available in the demo' };
  },

  /** verify-ypay-credentials: any saved demo credentials "work". */
  'verify-ypay-credentials': (_body, ctx) => {
    const tenant = adminTenant(ctx);
    return tenant.ypay_credentials_set ? { valid: true } : { valid: false, error: 'No YPay credentials saved' };
  },
};
