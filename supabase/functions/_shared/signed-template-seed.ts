import { studioSignedForms } from "./email-dist/legal/signed-template.js";
import { studioFormsScope } from "./email-dist/legal/field-defaults.js";

/** The studio fields a signed template is filled with. */
export interface SeedTenant {
  id: string;
  name: string;
  skin: string | null;
  language_default: string | null;
  contact_email: string | null;
  legal_profile?: Record<string, unknown> | null;
  /** tenants.health_declaration (NULL: from the field). */
  health_declaration?: boolean | null;
  /**
   * The skin row (embedded `verticals(...)`): its health-declaration default and legal add-on.
   * PostgREST returns one object for this link; an untyped client types it as a list.
   */
  verticals?: SeedSkinRow | SeedSkinRow[] | null;
}

/** The parts of a verticals row the forms follow. */
export interface SeedSkinRow {
  name_en?: string | null;
  name_he?: string | null;
  default_switches?: Record<string, unknown> | null;
  legal_addon?: string | null;
}

function skinRow(tenant: SeedTenant): SeedSkinRow | null {
  return (Array.isArray(tenant.verticals) ? tenant.verticals[0] : tenant.verticals) ?? null;
}

/** Which forms the studio's clients sign: its setting, else its field's default; its field's add-on. */
export function seedScope(tenant: SeedTenant) {
  const skin = skinRow(tenant);
  const switchValue = skin?.default_switches?.health_declaration;
  return studioFormsScope(
    {
      id: tenant.skin,
      nameEn: skin?.name_en ?? null,
      nameHe: skin?.name_he ?? null,
      healthDeclaration: typeof switchValue === "boolean" ? switchValue : null,
      legalAddon: skin?.legal_addon ?? null,
    },
    tenant.health_declaration,
  );
}

export interface SeedDeps {
  /** Whether the studio already has any consent template (then nothing is seeded). */
  hasTemplate(tenantId: string): Promise<boolean>;
  /** The audience and language of each active form (for fillMissing). */
  activeVersions(tenantId: string): Promise<Array<{ audience: string | null; language: string | null }>>;
  /** Inserts the active template. */
  insertTemplate(row: {
    tenant_id: string;
    name: string;
    content: string;
    version: number;
    version_hash: string;
    status: "active";
    audience: "child" | "adult" | null;
    language: "he" | "en";
  }): Promise<void>;
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
 * Gives a studio the forms its clients sign, filled with its details, in
 * Hebrew and English (each reader signs in their own language): both health
 * declarations (under 18 / adults, picked by age at signing) when its clients
 * sign one ("Clients sign a health declaration"; dance studios by default), and
 * every studio but a dance studio the agreement with its field's add-on. Never touches a studio that
 * already has a form. Returns how many were added.
 */
export async function seedSignedTemplate(
  deps: SeedDeps,
  tenant: SeedTenant,
  options: { fillMissing?: boolean } = {},
): Promise<number> {
  // The studio's own language first.
  const languages: Array<"he" | "en"> = tenant.language_default === "en" ? ["en", "he"] : ["he", "en"];
  // fillMissing: add only the (audience, language) versions the studio has no
  // active form for; a form with no language counts as the studio's language.
  // Existing forms are never changed or archived.
  let have: Set<string> | null = null;
  if (options.fillMissing) {
    const studioLang = languages[0];
    have = new Set(
      (await deps.activeVersions(tenant.id)).map((v) => `${v.audience ?? ""}|${v.language ?? studioLang}`),
    );
  } else if (await deps.hasTemplate(tenant.id)) {
    return 0;
  }
  let added = 0;
  const scope = seedScope(tenant);
  for (const lang of languages) {
    const forms = studioSignedForms(
      tenant.skin,
      {
        lang,
        tenantName: tenant.name,
        contactEmail: tenant.contact_email ?? "",
        profile: stringProfile(tenant.legal_profile),
      },
      scope,
    );
    for (const form of forms) {
      if (have?.has(`${form.audience ?? ""}|${lang}`)) continue;
      await deps.insertTemplate({
        tenant_id: tenant.id,
        name: form.name,
        content: form.content,
        version: 1,
        version_hash: await sha256Hex(form.content),
        status: "active",
        audience: form.audience,
        language: lang,
      });
      added += 1;
    }
  }
  return added;
}
