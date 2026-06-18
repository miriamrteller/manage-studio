import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { resolveOfferingPrice } from "./email-dist/pricing.js";
import { ensureBillingAccountForStudent } from "./ensure-billing-account.ts";
import { buildChargeMetadata } from "./payments/providers/mock.ts";
import type { ChargeMetadata } from "./payments/types.ts";
import { createServiceClient, requireAuthUser } from "./supabase.ts";
import { resolveAllowedTokenRecipientEmails } from "./token-recipient.ts";
import { extractWaiverToken, verifyWaiverToken } from "./waiver-token.ts";

export interface CheckoutRequestBody {
  offering_id: string;
  engagement_id: string;
  enrolment_token?: string;
}

export interface ResolvedCheckoutSession {
  service: SupabaseClient;
  tenantId: string;
  authUserId: string | null;
  engagement: {
    id: string;
    tenant_id: string;
    person_id: string;
    offering_id: string;
    status: string;
    billing_account_id: string;
  };
  tenant: {
    vat_rate: number | null;
    prices_include_vat: boolean | null;
    currency: string | null;
    payment_provider: string;
    payment_provider_public_key: string | null;
  };
  offering: {
    id: string;
    tenant_id: string;
    price_minor: number;
    currency: string | null;
  };
  pretaxMinor: number;
  vatMinor: number;
  totalMinor: number;
  vatRate: number;
  currency: string;
  metadata: ChargeMetadata;
  idempotencyKey: string;
}

type CheckoutError = { ok: false; status: number; error: string };
type CheckoutOk = { ok: true; session: ResolvedCheckoutSession };

export async function resolveCheckoutSession(
  req: Request,
  body: CheckoutRequestBody,
): Promise<CheckoutOk | CheckoutError> {
  if (!body.offering_id || !body.engagement_id) {
    return { ok: false, status: 400, error: "offering_id and engagement_id are required" };
  }

  const service = createServiceClient();
  const authHeader = req.headers.get("Authorization") ?? "";
  let tenantId: string | null = null;
  let authUserId: string | null = null;
  let tokenEmail: string | null = null;

  const bodyToken = typeof body.enrolment_token === "string" ? body.enrolment_token : null;
  const headerToken = extractWaiverToken(authHeader);
  const rawWaiverToken = headerToken ?? bodyToken;
  const verifiedToken = rawWaiverToken ? await verifyWaiverToken(rawWaiverToken) : null;

  if (authHeader.startsWith("Bearer ")) {
    const auth = await requireAuthUser(req);
    if (!("error" in auth)) {
      const { data: profile, error: profileError } = await service
        .from("user_profiles")
        .select("id, tenant_id")
        .eq("id", auth.user.id)
        .single();

      if (!profileError && profile?.tenant_id) {
        tenantId = profile.tenant_id as string;
        authUserId = profile.id as string;
      }
    }
  }

  if (!tenantId && !verifiedToken) {
    return { ok: false, status: 401, error: "Valid enrolment token is required" };
  }

  if (verifiedToken) {
    tenantId = verifiedToken.tid;
    tokenEmail = verifiedToken.em.toLowerCase();
    if (verifiedToken.eid !== body.engagement_id) {
      return { ok: false, status: 403, error: "Token does not match engagement" };
    }
  }

  if (!tenantId) {
    const { data: engagementForTenant, error: tenantLookupError } = await service
      .from("engagements")
      .select("tenant_id, status")
      .eq("id", body.engagement_id)
      .single();

    if (tenantLookupError || !engagementForTenant) {
      return { ok: false, status: 404, error: "Engagement not found" };
    }

    if (engagementForTenant.status !== "pending_payment") {
      return { ok: false, status: 403, error: "Engagement is not payable" };
    }

    tenantId = engagementForTenant.tenant_id as string;
  }

  const { data: engagement, error: engagementError } = await service
    .from("engagements")
    .select("id, tenant_id, person_id, offering_id, status, billing_account_id")
    .eq("id", body.engagement_id)
    .single();

  if (engagementError || !engagement) {
    return { ok: false, status: 404, error: "Engagement not found" };
  }

  if (engagement.tenant_id !== tenantId || engagement.offering_id !== body.offering_id) {
    return { ok: false, status: 403, error: "Engagement does not match tenant or offering" };
  }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("vat_rate, prices_include_vat, currency, payment_provider, payment_provider_public_key")
    .eq("id", tenantId)
    .single();

  if (tenantError || !tenant) {
    return { ok: false, status: 404, error: "Tenant not found" };
  }

  if (engagement.status !== "pending_payment") {
    return { ok: false, status: 403, error: "Engagement is not payable" };
  }

  let billingAccountId = engagement.billing_account_id as string | null;
  if (!billingAccountId) {
    billingAccountId = await ensureBillingAccountForStudent(
      service,
      engagement.tenant_id as string,
      engagement.person_id as string,
    );
    const { error: linkError } = await service
      .from("engagements")
      .update({ billing_account_id: billingAccountId })
      .eq("id", body.engagement_id);
    if (linkError) {
      return { ok: false, status: 500, error: "Failed to link billing account" };
    }
  }

  if (verifiedToken && verifiedToken.tid !== engagement.tenant_id) {
    return { ok: false, status: 403, error: "Token tenant mismatch" };
  }

  if (verifiedToken) {
    const allowedEmails = await resolveAllowedTokenRecipientEmails(service, {
      tenantId: engagement.tenant_id as string,
      engagementId: engagement.id as string,
      personId: engagement.person_id as string,
    });
    if (!tokenEmail || !allowedEmails.has(tokenEmail)) {
      return { ok: false, status: 403, error: "Token email mismatch" };
    }
  } else if (authUserId) {
    const { data: profile } = await service
      .from("user_profiles")
      .select("tenant_id")
      .eq("id", authUserId)
      .maybeSingle();
    if (!profile || profile.tenant_id !== engagement.tenant_id) {
      return { ok: false, status: 403, error: "Unauthorized for engagement tenant" };
    }
  }

  const { data: offering, error: offeringError } = await service
    .from("offerings")
    .select("id, tenant_id, price_minor, currency")
    .eq("id", body.offering_id)
    .single();

  if (offeringError || !offering || offering.tenant_id !== tenantId) {
    return { ok: false, status: 404, error: "Offering not found" };
  }

  const pricing = resolveOfferingPrice(
    { price_minor: offering.price_minor as number },
    {
      vat_rate: Number(tenant.vat_rate ?? 0.17),
      prices_include_vat: tenant.prices_include_vat !== false,
    },
  );

  const currency = (offering.currency ?? tenant.currency ?? "ILS").toUpperCase();
  const metadata = buildChargeMetadata({
    tenantId,
    engagementId: body.engagement_id,
    billingAccountId,
    offeringId: body.offering_id,
    personId: engagement.person_id as string,
    vatRate: pricing.vatRate,
    pretaxMinor: pricing.pretaxMinor,
    vatMinor: pricing.vatMinor,
    totalMinor: pricing.totalMinor,
    chargeType: "initial",
  });

  return {
    ok: true,
    session: {
      service,
      tenantId,
      authUserId,
      engagement: {
        id: engagement.id as string,
        tenant_id: engagement.tenant_id as string,
        person_id: engagement.person_id as string,
        offering_id: engagement.offering_id as string,
        status: engagement.status as string,
        billing_account_id: billingAccountId,
      },
      tenant: {
        vat_rate: tenant.vat_rate as number | null,
        prices_include_vat: tenant.prices_include_vat as boolean | null,
        currency: tenant.currency as string | null,
        payment_provider: tenant.payment_provider as string,
        payment_provider_public_key: tenant.payment_provider_public_key as string | null,
      },
      offering: {
        id: offering.id as string,
        tenant_id: offering.tenant_id as string,
        price_minor: offering.price_minor as number,
        currency: offering.currency as string | null,
      },
      pretaxMinor: pricing.pretaxMinor,
      vatMinor: pricing.vatMinor,
      totalMinor: pricing.totalMinor,
      vatRate: pricing.vatRate,
      currency,
      metadata,
      idempotencyKey: `engagement-${body.engagement_id}-${pricing.totalMinor}-${currency}`,
    },
  };
}
