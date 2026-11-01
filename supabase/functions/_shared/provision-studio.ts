import { z } from "npm:zod@3.22.4";

/** Payment options the setup wizard offers: live providers only (never mock or stripe). */
export const STUDIO_PAYMENT_PROVIDERS = ["offline", "grow", "icount", "invoice4u", "ypay", "tranzila"] as const;
/** Invoicing options: `none` for a studio that is not a registered business. */
export const STUDIO_INVOICING_PROVIDERS = [
  "none",
  "grow",
  "icount",
  "invoice4u",
  "ypay",
  "tranzila",
  "yesh",
  "green_invoice",
] as const;

const HEX = /^#[0-9A-Fa-f]{6}$/;

export const ProvisionStudioSchema = z.object({
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
export type ProvisionStudioInput = z.infer<typeof ProvisionStudioSchema>;

export const InviteOwnerSchema = z.object({
  tenantId: z.string().uuid(),
  ownerEmail: z.string().trim().toLowerCase().email(),
});

export interface ProvisionStudioDeps {
  /** provision_studio RPC; resolves to the new tenant id. */
  provisionStudio(input: ProvisionStudioInput): Promise<string>;
  /** The profile already using this email, if any. */
  findProfileByEmail(email: string): Promise<{ id: string; tenant_id: string } | null>;
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
  | { status: "failed"; reason: "email_in_other_studio" | "invite_failed"; message?: string };

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
    if (existing.tenant_id !== tenantId) return { status: "failed", reason: "email_in_other_studio" };
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
  | { ok: false; error: "email_in_other_studio" };

/**
 * Creates the studio, then invites its owner. The email is checked first, so a
 * studio is never created for an owner who can't be invited to it.
 */
export async function provisionStudio(
  deps: ProvisionStudioDeps,
  input: ProvisionStudioInput,
): Promise<ProvisionStudioResult> {
  const existing = await deps.findProfileByEmail(input.ownerEmail);
  if (existing) return { ok: false, error: "email_in_other_studio" };
  const tenantId = await deps.provisionStudio(input);
  const owner = await inviteStudioOwner(deps, tenantId, input.ownerEmail);
  return { ok: true, tenantId, subdomain: input.subdomain, owner };
}
