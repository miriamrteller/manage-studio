import { createServiceClient } from "./supabase.ts";
import { ensureBillingAccountForStudent } from "./ensure-billing-account.ts";
import { requireFeature } from "./feature-gate.ts";
import { signWaiverToken } from "./waiver-token.ts";

export interface PrepareBookingCheckoutBody {
  subdomain: string;
  hold_id: string;
  client_name: string;
  client_email: string;
  client_phone?: string | null;
}

export interface PrepareBookingCheckoutResponse {
  engagement_id: string;
  hold_id: string;
  token: string;
  /** Front-end redirect target — reuses the existing token completion flow. */
  redirect_path: string;
}

export function parsePrepareBookingCheckoutBody(
  raw: unknown,
): { ok: true; body: PrepareBookingCheckoutBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid body" };
  const b = raw as Record<string, unknown>;
  const subdomain = typeof b.subdomain === "string" ? b.subdomain.trim() : "";
  const hold_id = typeof b.hold_id === "string" ? b.hold_id : "";
  const client_name = typeof b.client_name === "string" ? b.client_name.trim() : "";
  const client_email = typeof b.client_email === "string" ? b.client_email.trim().toLowerCase() : "";
  const client_phone = typeof b.client_phone === "string" ? b.client_phone.trim() : null;

  if (!subdomain) return { ok: false, error: "subdomain is required" };
  if (!hold_id) return { ok: false, error: "hold_id is required" };
  if (!client_name) return { ok: false, error: "client_name is required" };
  if (!client_email || !client_email.includes("@")) return { ok: false, error: "valid client_email is required" };

  return { ok: true, body: { subdomain, hold_id, client_name, client_email, client_phone } };
}

export async function prepareBookingCheckout(
  body: PrepareBookingCheckoutBody,
): Promise<
  | { ok: true; response: PrepareBookingCheckoutResponse }
  | { ok: false; error: string; status: number }
> {
  const service = createServiceClient();

  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("subdomain", body.subdomain)
    .maybeSingle();
  if (!tenant?.id) return { ok: false, error: "Tenant not found", status: 404 };
  const tenantId = tenant.id as string;

  try {
    await requireFeature(tenantId, "scheduling:booking.client", service);
  } catch (res) {
    if (res instanceof Response) return { ok: false, error: "feature_not_available", status: 403 };
    throw res;
  }

  // Load and validate the hold
  const { data: hold } = await service
    .from("scheduling_holds")
    .select(
      "id, tenant_id, offering_id, starts_at, ends_at, expires_at, released_at, engagement_id, client_email",
    )
    .eq("id", body.hold_id)
    .maybeSingle();

  if (!hold || hold.tenant_id !== tenantId) return { ok: false, error: "Hold not found", status: 404 };
  if (hold.released_at) return { ok: false, error: "Hold released", status: 410 };
  if (new Date(hold.expires_at as string).getTime() <= Date.now()) {
    return { ok: false, error: "Hold expired", status: 410 };
  }

  // Bind checkout to the identity that created the hold (prevents hold_id hijack).
  const holdEmail = typeof hold.client_email === "string"
    ? hold.client_email.trim().toLowerCase()
    : "";
  if (!holdEmail || holdEmail !== body.client_email) {
    return { ok: false, error: "Hold email mismatch", status: 403 };
  }

  const offeringId = hold.offering_id as string;

  // Reuse an existing engagement for this hold if the client resubmits
  if (hold.engagement_id) {
    const token = await mintToken(hold.engagement_id as string, tenantId, body.client_email, hold.expires_at as string);
    return {
      ok: true,
      response: {
        engagement_id: hold.engagement_id as string,
        hold_id: hold.id as string,
        token,
        redirect_path: buildRedirect(hold.engagement_id as string, token),
      },
    };
  }

  // Resolve or create the guest person (people is UNIQUE on tenant_id, email)
  let personId: string;
  const { data: existingPerson } = await service
    .from("people")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", body.client_email)
    .maybeSingle();

  if (existingPerson?.id) {
    personId = existingPerson.id as string;
  } else {
    const { data: createdPerson, error: personErr } = await service
      .from("people")
      .insert({
        tenant_id: tenantId,
        name: body.client_name,
        email: body.client_email,
        status: "active",
      })
      .select("id")
      .single();
    if (personErr || !createdPerson?.id) {
      return { ok: false, error: personErr?.message ?? "Failed to create client", status: 500 };
    }
    personId = createdPerson.id as string;
  }

  const billingAccountId = await ensureBillingAccountForStudent(service, tenantId, personId);

  const { data: engagement, error: engErr } = await service
    .from("engagements")
    .insert({
      tenant_id: tenantId,
      person_id: personId,
      offering_id: offeringId,
      status: "pending_payment",
      billing_account_id: billingAccountId,
      booked_starts_at: hold.starts_at,
      booked_ends_at: hold.ends_at,
      scheduling_hold_id: hold.id,
    })
    .select("id")
    .single();

  if (engErr || !engagement?.id) {
    return { ok: false, error: engErr?.message ?? "Failed to create booking", status: 500 };
  }
  const engagementId = engagement.id as string;

  await service
    .from("scheduling_holds")
    .update({ engagement_id: engagementId })
    .eq("id", hold.id);

  const token = await mintToken(engagementId, tenantId, body.client_email, hold.expires_at as string);

  return {
    ok: true,
    response: {
      engagement_id: engagementId,
      hold_id: hold.id as string,
      token,
      redirect_path: buildRedirect(engagementId, token),
    },
  };
}

async function mintToken(
  engagementId: string,
  tenantId: string,
  email: string,
  holdExpiresAt: string,
): Promise<string> {
  // Token lives at least long enough to complete payment; capped by hold expiry.
  const holdExp = Math.floor(new Date(holdExpiresAt).getTime() / 1000);
  const minExp = Math.floor(Date.now() / 1000) + 3600;
  return signWaiverToken({
    eid: engagementId,
    tid: tenantId,
    em: email,
    exp: Math.max(holdExp, minExp),
  });
}

function buildRedirect(engagementId: string, token: string): string {
  return `/enrol/pay/${engagementId}?t=${encodeURIComponent(token)}`;
}
