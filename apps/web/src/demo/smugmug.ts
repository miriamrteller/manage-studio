/**
 * Demo backend for Settings › SmugMug (migration 20261104212815_smugmug_credentials
 * and the smugmug-connection Edge Function) and the "set a login password" prompt.
 * The demo never calls SmugMug: the demo studio starts connected, "Test connection"
 * answers from the saved state, and "Connect" can't open SmugMug's sign-in page,
 * so it says SmugMug couldn't be reached.
 */
import { DemoRpcError, type DemoContext, type FunctionHandler, type Row, type RpcHandler } from './fakeSupabase';

function isAdmin(ctx: DemoContext): boolean {
  const p = (ctx.db.user_profiles ?? []).find((u) => u.id === ctx.user?.id);
  return Array.isArray(p?.role) && (p.role as string[]).includes('tenant_admin');
}

function studio(ctx: DemoContext, fn: string): Row {
  if (!isAdmin(ctx)) throw new DemoRpcError(`${fn}: access denied`, '42501');
  const tenant = (ctx.db.tenants ?? [])[0];
  if (!tenant) throw new DemoRpcError('tenant not found');
  return tenant;
}

const hasKeys = (t: Row) => Boolean(t.smugmug_credentials_updated_at);

export const smugmugRpcs: Record<string, RpcHandler> = {
  tenant_smugmug_status: (_args, ctx) => {
    const t = studio(ctx, 'tenant_smugmug_status');
    return [
      {
        has_keys: hasKeys(t),
        connected: hasKeys(t) && Boolean(t.smugmug_connected_at),
        keys_updated_at: t.smugmug_credentials_updated_at ?? null,
        connected_at: t.smugmug_connected_at ?? null,
      },
    ];
  },
  // New keys replace the old ones and end the connection (Connect again with them).
  save_tenant_smugmug_credentials: (args, ctx) => {
    const t = studio(ctx, 'save_tenant_smugmug_credentials');
    if (!String(args.p_api_key ?? '').trim() || !String(args.p_api_secret ?? '').trim()) {
      throw new DemoRpcError('API key and secret are required', '22023');
    }
    t.smugmug_credentials_updated_at = new Date().toISOString();
    t.smugmug_connected_at = null;
    return null;
  },
  disconnect_tenant_smugmug: (_args, ctx) => {
    studio(ctx, 'disconnect_tenant_smugmug').smugmug_connected_at = null;
    return null;
  },
  // Demo sign-ins count as having a password, so the prompt doesn't greet every visit.
  my_login_has_password: (_args, ctx) => Boolean(ctx.user),
};

export const smugmugFunctions: Record<string, FunctionHandler> = {
  'smugmug-connection': (body, ctx) => {
    const t = studio(ctx, 'smugmug-connection');
    if (!hasKeys(t)) return { ok: false, code: 'no_keys' };
    if (body.action === 'test') return { ok: true, stage: t.smugmug_connected_at ? 'account' : 'keys' };
    // start / complete would go to SmugMug, which the demo never calls.
    return { ok: false, code: 'unreachable' };
  },
};
