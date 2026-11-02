/**
 * Demo handlers for studio setup screens: the legal-pack confirmation
 * (Settings → Legal, Finish setup) and the YPay connect form (Settings →
 * Payments, plus the Grow notice key) and lawyer-reviewed legal documents.
 * Nothing is sent or stored outside the browser; credentials typed into the
 * demo are not kept.
 */
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row, type RpcHandler } from './fakeSupabase';

/** tenant_legal_documents.document CHECK values. */
const LEGAL_DOCUMENTS = ['studio-privacy', 'enrolment-terms', 'accessibility', 'cookies'];

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

  /** get_grow_webhook_key_status: whether the studio has a Grow notice key yet. */
  get_grow_webhook_key_status: (_args, ctx) => {
    const tenant = adminTenant(ctx);
    const at = tenant.grow_webhook_key_created_at as string | undefined;
    return [{ configured: Boolean(at), key_version: at ? Number(tenant.grow_webhook_key_version ?? 1) : null, created_at: at ?? null }];
  },

  /** rotate_grow_webhook_key: a new random key, shown once (demo only, never used). */
  rotate_grow_webhook_key: (_args, ctx) => {
    const tenant = adminTenant(ctx);
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = `demo_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    tenant.grow_webhook_key_version = Number(tenant.grow_webhook_key_version ?? 0) + 1;
    tenant.grow_webhook_key_created_at = new Date().toISOString();
    return key;
  },

  /** get_tenant_legal_documents: lawyer-reviewed versions the studio uploaded in this demo visit. */
  get_tenant_legal_documents: (args, ctx) =>
    rows(ctx, 'tenant_legal_documents')
      .filter((d) => d.tenant_id === args.p_tenant_id)
      .map(({ document, language, kind, content, storage_path, file_name, uploaded_at }) => ({
        document, language, kind, content, storage_path, file_name, uploaded_at,
      })),

  /** save_tenant_legal_document: keep a lawyer-reviewed text or PDF in place of the generated draft. */
  save_tenant_legal_document: (args, ctx) => {
    const tenant = adminTenant(ctx);
    const document = String(args.p_document ?? '');
    if (!LEGAL_DOCUMENTS.includes(document)) throw new DemoRpcError('unknown document');
    const language = args.p_language === 'en' ? 'en' : 'he';
    const kind = args.p_kind === 'pdf' ? 'pdf' : 'text';
    if (kind === 'text' && !String(args.p_content ?? '').trim()) throw new DemoRpcError('content is required');
    const docs = rows(ctx, 'tenant_legal_documents');
    const i = docs.findIndex((d) => d.tenant_id === tenant.id && d.document === document);
    const row = {
      tenant_id: tenant.id,
      document,
      language,
      kind,
      content: kind === 'text' ? String(args.p_content) : null,
      storage_path: kind === 'pdf' ? String(args.p_storage_path ?? '') : null,
      file_name: kind === 'pdf' ? String(args.p_file_name ?? '') : null,
      uploaded_at: new Date().toISOString(),
    };
    if (i >= 0) docs[i] = row;
    else docs.push(row);
    return true;
  },

  /** revert_tenant_legal_document: back to the generated draft; true when there was an upload. */
  revert_tenant_legal_document: (args, ctx) => {
    const tenant = adminTenant(ctx);
    const docs = rows(ctx, 'tenant_legal_documents');
    const i = docs.findIndex((d) => d.tenant_id === tenant.id && d.document === args.p_document);
    if (i < 0) return false;
    docs.splice(i, 1);
    return true;
  },

  /** set_consent_template_lawyer_reviewed: mark a signed form reviewed, or back to a draft. */
  set_consent_template_lawyer_reviewed: (args, ctx) => {
    const tenant = adminTenant(ctx);
    const template = rows(ctx, 'consent_templates').find((t) => t.id === args.p_template_id && t.tenant_id === tenant.id);
    if (!template) throw new DemoRpcError('form not found');
    template.lawyer_reviewed_at = args.p_reviewed ? new Date().toISOString() : null;
    template.lawyer_reviewed_by = args.p_reviewed ? ctx.user?.id ?? null : null;
    return true;
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
