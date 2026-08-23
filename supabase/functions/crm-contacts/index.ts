import { createServiceClient, requireAuthUser } from "../_shared/edge-runtime/supabase.ts";
import { contactsResponseSchemaV1 } from "../_shared/crm-contract/contact.v1.ts";
import { mapContacts } from "../_shared/crm-contract/map-contacts.ts";
import type {
  CrmAccountRow,
  CrmContactPrefsRow,
  CrmEngagementRow,
  CrmNotificationRow,
  CrmOfferingRow,
  CrmPaymentRow,
  CrmPersonRow,
  CrmTenantRow,
} from "../_shared/crm-contract/map-contacts.ts";

/**
 * crm-contacts — read-only GET serving the mobile-crm v1 data contract
 * (see _shared/crm-contract/contact.v1.ts for the vendored source of truth).
 *
 * Auth: caller's Supabase JWT → user_profiles must carry tenant_admin (or
 * super_admin). All queries are scoped to the caller's own tenant; the
 * response is validated against the contract schema before it leaves, so a
 * mapping regression fails loud (500) instead of feeding the app bad data.
 *
 * CORS is an explicit allowlist — never "*": http://localhost:8081 (Expo web
 * dev) plus one configurable origin via the CRM_CONTACTS_ALLOWED_ORIGIN secret.
 *
 * Phase 1 scale note: reads are capped by PostgREST's default 1000-row page.
 * Pagination / server-side query delegation is a contract-v2 item.
 */

function corsHeadersFor(req: Request): Record<string, string> {
  const allowed = new Set(["http://localhost:8081"]);
  const configured = Deno.env.get("CRM_CONTACTS_ALLOWED_ORIGIN")?.trim();
  if (configured) allowed.add(configured.replace(/\/$/, ""));

  const origin = req.headers.get("Origin");
  if (!origin || !allowed.has(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAuthUser(req);
  if ("error" in auth) {
    return json({ error: auth.error }, auth.status);
  }

  const service = createServiceClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("tenant_id, role")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile?.tenant_id) {
    return json({ error: "Profile not found" }, 404);
  }
  const roles = Array.isArray(profile.role) ? profile.role : [];
  if (!roles.includes("tenant_admin") && !roles.includes("super_admin")) {
    return json({ error: "tenant_admin role required" }, 403);
  }

  const tenantId = profile.tenant_id as string;

  try {
    const [tenant, accounts, people, prefs, engagements, payments, offerings, notifications] =
      await Promise.all([
        service.from("tenants").select("name, currency").eq("id", tenantId).single(),
        service.from("accounts").select("id, person_id").eq("tenant_id", tenantId),
        service.from("people").select("id, account_id, name, email").eq("tenant_id", tenantId),
        service.from("contact_preferences")
          .select("person_id, email_opted_in, notify_announcements, whatsapp_number, voice_number")
          .eq("tenant_id", tenantId),
        service.from("engagements").select("person_id, status, payment_received_at")
          .eq("tenant_id", tenantId),
        service.from("payments")
          .select("account_id, person_id, offering_id, charge_type, status, total_amount_minor, paid_at")
          .eq("tenant_id", tenantId),
        service.from("offerings").select("id, name").eq("tenant_id", tenantId),
        service.from("notification_log")
          .select("recipient_person_id, status, subject, body_preview, sent_at, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

    const firstError = [tenant, accounts, people, prefs, engagements, payments, offerings, notifications]
      .map((r) => r.error)
      .find(Boolean);
    if (firstError || !tenant.data) {
      console.error("crm-contacts: query failed", firstError);
      return json({ error: "Failed to load contacts" }, 500);
    }

    const envelope = mapContacts({
      tenant: tenant.data as CrmTenantRow,
      accounts: (accounts.data ?? []) as CrmAccountRow[],
      people: (people.data ?? []) as CrmPersonRow[],
      contactPreferences: (prefs.data ?? []) as CrmContactPrefsRow[],
      engagements: (engagements.data ?? []) as CrmEngagementRow[],
      payments: (payments.data ?? []) as CrmPaymentRow[],
      offerings: (offerings.data ?? []) as CrmOfferingRow[],
      notifications: (notifications.data ?? []) as CrmNotificationRow[],
    });

    const parsed = contactsResponseSchemaV1.safeParse(envelope);
    if (!parsed.success) {
      console.error("crm-contacts: contract violation", parsed.error.issues);
      return json({ error: "Response failed contract validation" }, 500);
    }

    return json(parsed.data);
  } catch (err) {
    console.error("crm-contacts: unhandled error", err);
    return json({ error: "Internal error" }, 500);
  }
});
