/**
 * The few Cloudflare for SaaS calls self-serve custom domains need, on the
 * opalswift.com zone only. The token (CLOUDFLARE_SAAS_API_TOKEN) is scoped to
 * that zone: SSL and Certificates: Edit, Zone: Read.
 */

export interface CfValidationRecord {
  txt_name?: string;
  txt_value?: string;
  status?: string;
}

export interface CfCustomHostname {
  id: string;
  hostname: string;
  /** pending | active | moved | deleted | blocked | … */
  status: string;
  ssl?: {
    status?: string;
    validation_records?: CfValidationRecord[];
    validation_errors?: { message?: string }[];
  };
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
}

export interface CloudflareSaas {
  create(hostname: string): Promise<CfCustomHostname>;
  get(id: string): Promise<CfCustomHostname | null>;
  remove(id: string): Promise<void>;
}

type Fetch = typeof fetch;

export class CloudflareError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function cloudflareSaas(opts: { token: string; zoneId: string; fetchFn?: Fetch }): CloudflareSaas {
  const f = opts.fetchFn ?? fetch;
  const base = `https://api.cloudflare.com/client/v4/zones/${opts.zoneId}/custom_hostnames`;
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await f(url, {
      ...init,
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({})) as {
      success?: boolean;
      result?: unknown;
      errors?: { message?: string }[];
    };
    return { res, body };
  };
  return {
    async create(hostname) {
      const { res, body } = await call(base, {
        method: "POST",
        body: JSON.stringify({
          hostname,
          ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } },
        }),
      });
      if (!res.ok || !body.success) {
        throw new CloudflareError(body.errors?.[0]?.message ?? `create failed (${res.status})`, res.status);
      }
      return body.result as CfCustomHostname;
    },
    async get(id) {
      const { res, body } = await call(`${base}/${encodeURIComponent(id)}`);
      if (res.status === 404) return null;
      if (!res.ok || !body.success) {
        throw new CloudflareError(body.errors?.[0]?.message ?? `get failed (${res.status})`, res.status);
      }
      return body.result as CfCustomHostname;
    },
    async remove(id) {
      const { res, body } = await call(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.status === 404) return;
      if (!res.ok || body.success === false) {
        throw new CloudflareError(body.errors?.[0]?.message ?? `delete failed (${res.status})`, res.status);
      }
    },
  };
}
