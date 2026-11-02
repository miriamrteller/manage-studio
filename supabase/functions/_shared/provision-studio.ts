import { z } from "npm:zod@3.22.4";
import { invoicingPairsWithPayment } from "./provider-pairing.ts";

/** Payment options the setup wizard offers: live providers only (never mock or stripe). */
export const STUDIO_PAYMENT_PROVIDERS = ["offline", "grow", "icount", "invoice4u", "ypay", "tranzila"] as const;
/**
 * Invoicing options: `none` = no documents through OpalSwift. Yesh and Tranzila invoicing are
 * not built yet, so they are not offered (see provider-pairing.ts).
 */
export const STUDIO_INVOICING_PROVIDERS = [
  "none",
  "grow",
  "icount",
  "invoice4u",
  "ypay",
  "green_invoice",
] as const;

const HEX = /^#[0-9A-Fa-f]{6}$/;

const ProvisionStudioFields = z.object({
  name: z.string().trim().min(1).max(120),
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  plan: z.enum(["essential", "professional"]),
  vertical: z.string().trim().min(1),
  ownerEmail: z.string().trim().toLowerCase().email(),
  languageDefault: z.enum(["he", "en"]).default("en"),
  country: z.enum(["IL", "US"]).default("IL"),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("ILS"),
  phoneRegion: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("IL"),
  paymentProvider: z.enum(STUDIO_PAYMENT_PROVIDERS),
  invoicingProvider: z.enum(STUDIO_INVOICING_PROVIDERS),
  primaryColor: z.string().regex(HEX).default("#5B6CFF"),
  accentColor: z.string().regex(HEX).default("#21D1C2"),
});

/** Rejects an invoicing service that cannot issue documents for the chosen payment provider. */
const PAIRING_RULE = {
  check: (v: { paymentProvider: string; invoicingProvider: string }) =>
    invoicingPairsWithPayment(v.paymentProvider, v.invoicingProvider),
  message: "This invoicing service cannot issue documents for this payment provider",
  path: ["invoicingProvider"],
};

export const ProvisionStudioSchema = ProvisionStudioFields.refine(PAIRING_RULE.check, {
  message: PAIRING_RULE.message,
  path: PAIRING_RULE.path,
});
export type ProvisionStudioInput = z.infer<typeof ProvisionStudioSchema>;

export const InviteOwnerSchema = z.object({
  tenantId: z.string().uuid(),
  ownerEmail: z.string().trim().toLowerCase().email(),
});

/**
 * An email as an exact ILIKE pattern: `_` and `%` are wildcards in LIKE, so
 * "a_b@x.com" would also match "axb@x.com". Escapes them (and the escape
 * character) so the lookup is an exact, case-insensitive match.
 */
export function exactIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export interface ProvisionStudioDeps {
  /** provision_studio RPC; resolves to the new tenant id. */
  provisionStudio(input: ProvisionStudioInput): Promise<string>;
  /** The profile already using this email, if any. */
  findProfileByEmail(email: string): Promise<{ id: string; tenant_id: string; role?: string[] | null } | null>;
  /** Studio subdomain for a tenant id. */
  tenantSubdomain(tenantId: string): Promise<string | null>;
  /** Sends the invite email; the account is created in the studio named by `subdomain`. */
  inviteUser(email: string, subdomain: string): Promise<{ userId: string }>;
  /** assign_studio_owner RPC. */
  assignOwner(tenantId: string, userId: string): Promise<void>;
}

export type OwnerInviteResult =
  | { status: "invited" }
  | { status: "already_owner" }
  | { status: "failed"; reason: OwnerRefusal | "invite_failed"; message?: string };

/**
 * Why an owner email is refused. `email_is_platform_owner`: the platform owner's own
 * account (super_admin) already manages every studio; making it one studio's admin
 * would move the account and replace its platform role, so a studio owner needs a
 * different email.
 */
export type OwnerRefusal = "email_in_other_studio" | "email_is_platform_owner";

function refusalFor(
  profile: { tenant_id: string; role?: string[] | null },
  tenantId: string | null,
): OwnerRefusal | null {
  if ((profile.role ?? []).includes("super_admin")) return "email_is_platform_owner";
  if (profile.tenant_id !== tenantId) return "email_in_other_studio";
  return null;
}

/**
 * Invites the owner to the studio and makes them its admin. An email that already
 * belongs to another studio is refused: an account belongs to one studio, and moving
 * it would cut that person off from their own studio.
 */
export async function inviteStudioOwner(
  deps: ProvisionStudioDeps,
  tenantId: string,
  email: string,
): Promise<OwnerInviteResult> {
  const existing = await deps.findProfileByEmail(email);
  if (existing) {
    const refusal = refusalFor(existing, tenantId);
    if (refusal) return { status: "failed", reason: refusal };
    await deps.assignOwner(tenantId, existing.id);
    return { status: "already_owner" };
  }
  const subdomain = await deps.tenantSubdomain(tenantId);
  if (!subdomain) return { status: "failed", reason: "invite_failed", message: "Studio not found" };
  try {
    const { userId } = await deps.inviteUser(email, subdomain);
    await deps.assignOwner(tenantId, userId);
    return { status: "invited" };
  } catch (err) {
    return { status: "failed", reason: "invite_failed", message: err instanceof Error ? err.message : String(err) };
  }
}

export type ProvisionStudioResult =
  | { ok: true; tenantId: string; subdomain: string; owner: OwnerInviteResult }
  | { ok: false; error: OwnerRefusal };

/**
 * Creates the studio, then invites its owner. The email is checked first, so a
 * studio is never created for an owner who can't be invited to it.
 */
export async function provisionStudio(
  deps: ProvisionStudioDeps,
  input: ProvisionStudioInput,
): Promise<ProvisionStudioResult> {
  const existing = await deps.findProfileByEmail(input.ownerEmail);
  if (existing) return { ok: false, error: refusalFor(existing, null) ?? "email_in_other_studio" };
  const tenantId = await deps.provisionStudio(input);
  const owner = await inviteStudioOwner(deps, tenantId, input.ownerEmail);
  return { ok: true, tenantId, subdomain: input.subdomain, owner };
}

// ── Self-serve signup (free beta) ────────────────────────────────────────────

/** The wizard's self-serve request: the owner is the signed-in account, so no email. */
export const SelfServeStudioSchema = ProvisionStudioFields.omit({ ownerEmail: true }).extend({
  /** Version of the platform terms + DPA the owner ticked (see apps/web legal/acceptance.ts). */
  termsVersion: z.string().trim().min(1).max(64),
  termsLanguage: z.enum(["he", "en"]),
  /** Cloudflare Turnstile token; required only when TURNSTILE_SECRET_KEY is set. */
  captchaToken: z.string().max(4096).optional(),
}).refine(PAIRING_RULE.check, { message: PAIRING_RULE.message, path: PAIRING_RULE.path });
export type SelfServeStudioInput = z.infer<typeof SelfServeStudioSchema>;

/** Why a self-serve request is refused, with the HTTP status the function returns. */
export type SelfServeRefusal =
  | "self_serve_disabled"
  | "email_not_confirmed"
  | "captcha_failed"
  | "account_has_studio"
  | "subdomain_unavailable";

export const SELF_SERVE_REFUSAL_STATUS: Record<SelfServeRefusal, number> = {
  self_serve_disabled: 403,
  email_not_confirmed: 403,
  captcha_failed: 403,
  account_has_studio: 409,
  subdomain_unavailable: 409,
};

export interface SelfServeDeps {
  /** SELF_SERVE_SIGNUP_ENABLED=true on the project. */
  enabled: boolean;
  /** Verifies a Turnstile token; null when no TURNSTILE_SECRET_KEY is set (no CAPTCHA). */
  verifyCaptcha: ((token: string) => Promise<boolean>) | null;
  /** create_self_serve_studio RPC; resolves to the new tenant id. */
  createStudio(userId: string, input: SelfServeStudioInput): Promise<string>;
}

export type SelfServeResult =
  | { ok: true; tenantId: string; subdomain: string }
  | { ok: false; error: SelfServeRefusal | "invalid"; message?: string };

/** create_self_serve_studio / provision_studio error text → a refusal code, if it is one. */
export function selfServeRefusalFor(message: string): SelfServeRefusal | null {
  if (message.includes("account_has_studio")) return "account_has_studio";
  if (message.includes("email_not_confirmed")) return "email_not_confirmed";
  if (/Subdomain (is reserved|already taken)/.test(message)) return "subdomain_unavailable";
  // Two requests racing for the same address: the unique index wins.
  if (message.includes("tenants_subdomain")) return "subdomain_unavailable";
  return null;
}

/**
 * Creates a studio for the signed-in account and makes it the studio's admin.
 * Off unless the project enables it. The email must be confirmed; the database
 * checks that again, and that the account has no studio yet.
 */
export async function selfServeStudio(
  deps: SelfServeDeps,
  user: { id: string; email_confirmed_at?: string | null },
  input: SelfServeStudioInput,
): Promise<SelfServeResult> {
  if (!deps.enabled) return { ok: false, error: "self_serve_disabled" };
  if (!user.email_confirmed_at) return { ok: false, error: "email_not_confirmed" };
  if (deps.verifyCaptcha) {
    const passed = input.captchaToken ? await deps.verifyCaptcha(input.captchaToken) : false;
    if (!passed) return { ok: false, error: "captcha_failed" };
  }
  try {
    const tenantId = await deps.createStudio(user.id, input);
    return { ok: true, tenantId, subdomain: input.subdomain };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const refusal = selfServeRefusalFor(message);
    if (refusal) return { ok: false, error: refusal };
    return { ok: false, error: "invalid", message };
  }
}

export { verifyTurnstile } from "./turnstile.ts";
