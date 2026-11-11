/**
 * An enquiry sent with the studio's own email address is not a lead: it is
 * someone at the studio trying the form (a fake lead). This refuses it on the
 * studio enquiry form (crm-lead-capture) and on the opalswift.com contact
 * form, which files leads in the hq studio (crm-lead-ingest).
 *
 * "The studio's own" means any of:
 *   - the business email and sending address on the studio (tenants);
 *   - the emails on its legal pages (legal_profile);
 *   - the login email of anyone with a staff role in the studio;
 *   - the email on any staff record.
 *
 * Addresses match ignoring case and a "+tag" before the @.
 *
 * The lookup never blocks a real enquiry: if it fails, the enquiry goes
 * through as before.
 */

/** Roles that mean a login belongs to the studio, not to a client. */
export const STUDIO_STAFF_ROLES = [
  "tenant_admin",
  "super_admin",
  "staff",
  "teacher",
  "photographer",
] as const;

/** Legal-page fields that hold an email address. */
const LEGAL_EMAIL_KEYS = ["email", "privacy_contact_email", "accessibility_contact_email"] as const;

/** Lower case, trimmed, with any "+tag" before the @ removed. Null when not an address. */
export function normaliseEmailForMatch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at).replace(/\+.*$/, "");
  if (!local) return null;
  return `${local}@${email.slice(at + 1)}`;
}

/** True when `email` is one of the studio's own addresses. */
export function isStudioOwnEmail(email: string | null | undefined, ownEmails: Iterable<unknown>): boolean {
  const target = normaliseEmailForMatch(email);
  if (!target) return false;
  for (const own of ownEmails) {
    if (normaliseEmailForMatch(own) === target) return true;
  }
  return false;
}

/** The studio's email fields as stored on the tenant row. */
export function tenantOwnEmails(tenant: {
  contact_email?: string | null;
  from_email?: string | null;
  legal_profile?: unknown;
}): string[] {
  const out: string[] = [];
  if (tenant.contact_email) out.push(tenant.contact_email);
  if (tenant.from_email) out.push(tenant.from_email);
  const legal = tenant.legal_profile;
  if (legal && typeof legal === "object") {
    for (const key of LEGAL_EMAIL_KEYS) {
      const v = (legal as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out.push(v);
    }
  }
  return out;
}

/** Only what this check needs from a Supabase service client. */
// deno-lint-ignore no-explicit-any
type ServiceClient = { from: (table: string) => any };

/**
 * True when `email` belongs to the studio itself. Reads the tenant's own
 * email fields, staff logins and staff records. Any read error counts as
 * "not the studio's", so a real enquiry is never lost to it.
 */
export async function enquiryUsesStudioEmail(
  service: ServiceClient,
  tenantId: string,
  email: string | null | undefined,
): Promise<boolean> {
  if (!normaliseEmailForMatch(email)) return false;
  try {
    const [tenantRes, profilesRes, staffRes] = await Promise.all([
      service
        .from("tenants")
        .select("contact_email, from_email, legal_profile")
        .eq("id", tenantId)
        .maybeSingle(),
      service
        .from("user_profiles")
        .select("email")
        .eq("tenant_id", tenantId)
        .overlaps("role", [...STUDIO_STAFF_ROLES]),
      service
        .from("staff")
        .select("email")
        .eq("tenant_id", tenantId)
        .not("email", "is", null),
    ]);
    const own: unknown[] = [];
    if (tenantRes.error) console.error("studio-own-email: tenant read failed", tenantRes.error.message);
    else if (tenantRes.data) own.push(...tenantOwnEmails(tenantRes.data));
    if (profilesRes.error) console.error("studio-own-email: staff logins read failed", profilesRes.error.message);
    else for (const row of profilesRes.data ?? []) own.push(row.email);
    if (staffRes.error) console.error("studio-own-email: staff read failed", staffRes.error.message);
    else for (const row of staffRes.data ?? []) own.push(row.email);
    return isStudioOwnEmail(email, own);
  } catch (err) {
    console.error("studio-own-email: check failed", err);
    return false;
  }
}
