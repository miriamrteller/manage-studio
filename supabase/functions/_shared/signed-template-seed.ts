import { studioSignedTemplate } from "./email-dist/legal/signed-template.js";

/** The studio fields a signed template is filled with. */
export interface SeedTenant {
  id: string;
  name: string;
  skin: string | null;
  language_default: string | null;
  contact_email: string | null;
  legal_profile?: Record<string, unknown> | null;
}

export interface SeedDeps {
  /** Whether the studio already has any consent template (then nothing is seeded). */
  hasTemplate(tenantId: string): Promise<boolean>;
  /** Inserts the active template. */
  insertTemplate(row: { tenant_id: string; name: string; content: string; version: number; version_hash: string; status: "active" }): Promise<void>;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stringProfile(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Gives a studio the form its clients sign (dance: health declaration;
 * photographer: shoot agreement), filled with its details, in its language.
 * Never replaces an existing template. Returns whether one was added.
 */
export async function seedSignedTemplate(deps: SeedDeps, tenant: SeedTenant): Promise<boolean> {
  const lang = tenant.language_default === "he" ? "he" : "en";
  const template = studioSignedTemplate(tenant.skin, {
    lang,
    tenantName: tenant.name,
    contactEmail: tenant.contact_email ?? "",
    profile: stringProfile(tenant.legal_profile),
  });
  if (!template) return false;
  if (await deps.hasTemplate(tenant.id)) return false;
  await deps.insertTemplate({
    tenant_id: tenant.id,
    name: template.name,
    content: template.content,
    version: 1,
    version_hash: await sha256Hex(template.content),
    status: "active",
  });
  return true;
}
