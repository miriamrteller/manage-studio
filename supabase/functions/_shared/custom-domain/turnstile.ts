/**
 * Keeps a studio's custom domain on the Turnstile widget's hostname list. The
 * bot check on sign-in, sign-up and enquiry forms only runs on listed
 * hostnames; anywhere else it shows "Unable to connect to website" (110200).
 *
 * Cloudflare API: GET and PUT /accounts/{account}/challenges/widgets/{sitekey}.
 * PUT replaces the whole widget, so we read it, change `domains` and send back
 * the editable settings unchanged. The token needs Account · Turnstile · Edit
 * (the same CLOUDFLARE_SAAS_API_TOKEN, one more permission).
 *
 * Only an exact hostname counts as listed. A parent domain on the list may or
 * may not cover it, and guessing wrong would break sign-in, so we add it anyway.
 */

/** Free plan: 10 hostnames per widget (Enterprise: 200). */
export const DEFAULT_HOSTNAME_LIMIT = 10;

export type AddResult = "added" | "already_listed" | "full";

export interface TurnstileHostnames {
  /** Adds the hostname unless it is listed already or the widget is full. */
  add(hostname: string): Promise<AddResult>;
  /** Takes the hostname off. Not listed: nothing to do. */
  remove(hostname: string): Promise<void>;
}

export class TurnstileError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface Widget {
  name: string;
  domains: string[];
  mode: string;
  bot_fight_mode?: boolean;
  clearance_level?: string;
  ephemeral_id?: boolean;
  offlabel?: boolean;
  region?: string;
}

/** The fields PUT accepts. The widget's secret (in the GET answer) is never sent back or kept. */
const EDITABLE = ["name", "mode", "bot_fight_mode", "clearance_level", "ephemeral_id", "offlabel", "region"] as const;

type Fetch = typeof fetch;

export function turnstileHostnames(opts: {
  token: string;
  accountId: string;
  siteKey: string;
  limit?: number;
  fetchFn?: Fetch;
}): TurnstileHostnames {
  const f = opts.fetchFn ?? fetch;
  const limit = opts.limit ?? DEFAULT_HOSTNAME_LIMIT;
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(opts.accountId)}/challenges/widgets/${
      encodeURIComponent(opts.siteKey)
    }`;
  const call = async (init: RequestInit = {}) => {
    const res = await f(url, {
      ...init,
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
    });
    const body = await res.json().catch(() => ({})) as {
      success?: boolean;
      result?: Widget;
      errors?: { message?: string }[];
    };
    if (!res.ok || !body.success || !body.result) {
      throw new TurnstileError(body.errors?.[0]?.message ?? `turnstile widget call failed (${res.status})`, res.status);
    }
    return body.result;
  };
  const save = async (widget: Widget, domains: string[]) => {
    const payload: Record<string, unknown> = { domains };
    for (const key of EDITABLE) if (widget[key] !== undefined) payload[key] = widget[key];
    await call({ method: "PUT", body: JSON.stringify(payload) });
  };
  const norm = (h: string) => h.trim().toLowerCase().replace(/\.$/, "");

  return {
    async add(hostname) {
      const host = norm(hostname);
      // Read, change, write, then read again: a write by another request in
      // between (PUT replaces the list) is caught and retried once.
      for (let attempt = 0; attempt < 2; attempt++) {
        const widget = await call();
        const domains = (widget.domains ?? []).map(norm);
        if (domains.includes(host)) return attempt === 0 ? "already_listed" : "added";
        if (domains.length >= limit) return "full";
        await save(widget, [...domains, host]);
        const after = await call();
        if ((after.domains ?? []).map(norm).includes(host)) return "added";
      }
      throw new TurnstileError("hostname did not stay on the widget", 409);
    },
    async remove(hostname) {
      const host = norm(hostname);
      const widget = await call();
      const domains = (widget.domains ?? []).map(norm);
      if (!domains.includes(host)) return;
      const rest = domains.filter((d) => d !== host);
      // The widget always keeps at least opalswift.com; never send an empty list.
      if (rest.length === 0) return;
      await save(widget, rest);
    },
  };
}
