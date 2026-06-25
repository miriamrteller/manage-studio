import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getEnv } from "../../env.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { growAmountFromMinor, minorFromGrowAmount } from "../grow/amount.ts";
import { fromGrowCustomFields, peekGrowTenantId, toGrowCustomFields } from "../grow/metadata.ts";

interface GrowCredentials {
  userId: string;
  pageCode: string;
  apiKey: string;
}

interface GrowNotifyData {
  transactionId?: string | number;
  transactionToken?: string;
  sum?: string | number;
  paymentType?: string | number;
  cField1?: string;
  cField2?: string;
  cField3?: string;
  cField4?: string;
  transactionUniqueIdentifier?: string;
}

/** Parsed Grow notify, split into the canonical event plus the fields Approve needs. */
export interface ParsedGrowNotify {
  event: PaymentEvent;
  transactionId: string;
  transactionToken?: string;
  paymentType?: string;
}

function growApiBase(): string {
  return getEnv("GROW_API_BASE") ?? "https://sandbox.meshulam.co.il/api/light/server/1.0";
}

/**
 * Parse a Grow notify webhook body into our canonical PaymentEvent. Pure — no network — so
 * it can be unit-tested against captured sandbox fixtures.
 */
export function parseGrowNotify(body: Record<string, unknown>): ParsedGrowNotify {
  const status = body.status ?? (body.data as Record<string, unknown> | undefined)?.status;
  const data = ((body.data as GrowNotifyData | undefined) ?? (body as GrowNotifyData)) ?? {};

  const metadata = fromGrowCustomFields({
    cField1: data.cField1,
    cField2: data.cField2,
    cField3: data.cField3,
    cField4: data.cField4,
  });

  const providerPaymentRef =
    data.transactionUniqueIdentifier ?? String(data.transactionId ?? "");
  if (!providerPaymentRef) {
    throw new Error("Grow notify missing transaction identifier");
  }

  const amountMinor = data.sum != null
    ? minorFromGrowAmount(data.sum)
    : Number(metadata.total_amount_minor ?? 0);
  const vatRate = Number(metadata.vat_rate ?? 0.17);
  const pretax = Number(metadata.pretax_amount_minor) || Math.round(amountMinor / (1 + vatRate));
  const vatMinor = Number(metadata.vat_amount_minor) || amountMinor - pretax;

  const succeeded = String(status) === "1" || status === 1;

  const event: PaymentEvent = {
    type: succeeded ? "payment.succeeded" : "payment.failed",
    providerPaymentRef,
    metadata,
    amountMinor,
    currency: "ILS",
    pretaxAmountMinor: pretax,
    vatAmountMinor: vatMinor,
    vatRate,
    offeringId: metadata.offering_id,
    personId: metadata.person_id,
    ...(succeeded ? {} : { failureMessage: "Grow transaction not approved" }),
  };

  return {
    event,
    transactionId: String(data.transactionId ?? providerPaymentRef),
    transactionToken: data.transactionToken,
    paymentType: data.paymentType != null ? String(data.paymentType) : undefined,
  };
}

/** Document fields extracted from a Grow invoice/document notify, plus the routing keys. */
export interface ParsedGrowInvoice {
  tenantId: string;
  providerPaymentRef: string;
  externalDocumentId: string;
  externalDocumentNumber?: string;
  documentUrl?: string;
}

/**
 * Parse a Grow document notify into the fields needed to upsert onto the matching payment.
 * Grow bundles invoicing with the charge, so the document arrives on its own webhook keyed by
 * the same `transactionUniqueIdentifier` and `cField1` (tenant) we sent at charge time. Pure —
 * no network — so it can be unit-tested against captured fixtures.
 */
export function parseGrowInvoiceNotify(body: Record<string, unknown>): ParsedGrowInvoice {
  const data = ((body.data as Record<string, unknown> | undefined) ?? body) ?? {};
  const tenantId = peekGrowTenantId(body);
  const providerPaymentRef =
    (data.transactionUniqueIdentifier as string | undefined) ??
    String((data.transactionId as string | number | undefined) ?? "");
  const externalDocumentId = String(
    (data.documentId as string | number | undefined) ??
      (data.docId as string | number | undefined) ??
      "",
  );

  if (!tenantId || !providerPaymentRef || !externalDocumentId) {
    throw new Error("Grow invoice notify missing tenant, transaction, or document id");
  }

  const docNumber = data.documentNumber ?? data.docNumber ?? data.asmachta;
  const docUrl = data.documentUrl ?? data.docUrl ?? data.pdfUrl ?? data.url;

  return {
    tenantId,
    providerPaymentRef,
    externalDocumentId,
    externalDocumentNumber: docNumber != null ? String(docNumber) : undefined,
    documentUrl: docUrl != null ? String(docUrl) : undefined,
  };
}

export class GrowPaymentProvider implements PaymentProvider {
  readonly slug = "grow";

  constructor(private readonly service: SupabaseClient) {}

  private async getCredentials(tenantId: string): Promise<GrowCredentials> {
    const { data: creds, error } = await this.service.rpc("get_tenant_payment_credentials", {
      p_tenant_id: tenantId,
    });
    if (error || !creds?.[0]?.payment_provider_secret_key) {
      throw new Error("Grow credentials not configured");
    }
    const cred = creds[0] as {
      payment_provider_public_key: string | null;
      payment_provider_secret_key: string;
    };

    // The Grow user id is stored in the vendor-generic account id column (not a secret).
    const { data: tenant } = await this.service
      .from("tenants")
      .select("payment_provider_account_id")
      .eq("id", tenantId)
      .single();

    if (!cred.payment_provider_public_key || !tenant?.payment_provider_account_id) {
      throw new Error("Grow page code or user id not configured");
    }

    return {
      userId: tenant.payment_provider_account_id as string,
      pageCode: cred.payment_provider_public_key,
      apiKey: cred.payment_provider_secret_key,
    };
  }

  /**
   * Best-effort auth health ping used by the settings "Test connection" button. Loads the
   * tenant's stored credentials and asks Grow to echo the account's permissions; any HTTP or
   * status error is reported back as an invalid result with the provider's message.
   */
  async verifyCredentials(tenantId: string): Promise<{ valid: boolean; message?: string }> {
    let creds: GrowCredentials;
    try {
      creds = await this.getCredentials(tenantId);
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : "Credentials missing" };
    }

    try {
      const res = await fetch(`${growApiBase()}/getApiUserPermissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageCode: creds.pageCode,
          userId: creds.userId,
          apiKey: creds.apiKey,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: number;
        err?: { message?: string };
      };
      if (!res.ok || json.status !== 1) {
        return { valid: false, message: json.err?.message ?? `Grow returned ${res.status}` };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : "Network error" };
    }
  }

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const tenantId = params.metadata.tenant_id;
    const creds = await this.getCredentials(tenantId);

    // Recurring renewals reuse the saved card token (server-to-server, no hosted page). The
    // charge still confirms via the notify webhook, so we return pendingWebhook like the
    // hosted-page path rather than finalising inline.
    if (params.savedToken) {
      return this.chargeWithToken(params, creds);
    }

    const customFields = toGrowCustomFields(params.metadata);
    const notifyUrl = getEnv("GROW_NOTIFY_URL") ?? "";

    const payload: Record<string, unknown> = {
      pageCode: creds.pageCode,
      userId: creds.userId,
      apiKey: creds.apiKey,
      sum: growAmountFromMinor(params.amountMinor),
      description: `${params.metadata.charge_type} ${params.metadata.engagement_id}`,
      paymentNum: 1,
      maxPaymentNum: params.installments ?? 1, // GAP 1: installments support (1–12)
      transactionUniqueIdentifier: params.idempotencyKey,
      // Save the card token on the first (enrolment) charge so renewals can reuse it (G6).
      saveCardToken: params.metadata.charge_type === "initial" ? 1 : 0,
      ...(notifyUrl ? { notifyUrl } : {}),
      // GAP 2: Osek Patur — pass allocationNumber when present
      ...(params.metadata.allocation_number
        ? { allocationNumber: params.metadata.allocation_number }
        : {}),
      ...customFields,
    };

    const res = await fetch(`${growApiBase()}/createPaymentProcess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      status?: number;
      data?: { url?: string; processId?: string | number; processToken?: string };
      err?: { message?: string };
    };

    if (!res.ok || json.status !== 1 || !json.data?.url) {
      throw new Error(json.err?.message ?? "Grow createPaymentProcess failed");
    }

    return {
      providerPaymentRef: params.idempotencyKey,
      pageUrl: json.data.url,
      pendingWebhook: true,
    };
  }

  private async chargeWithToken(
    params: ChargeParams,
    creds: GrowCredentials,
  ): Promise<ChargeResult> {
    const res = await fetch(`${growApiBase()}/createTransactionWithToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageCode: creds.pageCode,
        userId: creds.userId,
        apiKey: creds.apiKey,
        token: params.savedToken,
        sum: growAmountFromMinor(params.amountMinor),
        description: `${params.metadata.charge_type} ${params.metadata.engagement_id}`,
        transactionUniqueIdentifier: params.idempotencyKey,
        ...toGrowCustomFields(params.metadata),
      }),
    });
    const json = (await res.json()) as { status?: number; err?: { message?: string } };
    if (!res.ok || json.status !== 1) {
      throw new Error(json.err?.message ?? "Grow token charge failed");
    }
    return { providerPaymentRef: params.idempotencyKey, pendingWebhook: true };
  }

  async constructEvent(rawBody: string, _headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    const body = JSON.parse(rawBody) as Record<string, unknown>;

    // GAP 4: Webhook key validation — authenticate the request came from Grow before processing.
    // Key is stored encrypted in grow_webhook_secrets (per-tenant, rotatable).
    // If no key is stored for this tenant, validation is skipped (opt-in).
    const tenantIdFromBody = peekGrowTenantId(body);
    if (tenantIdFromBody) {
      const data = (body.data as Record<string, unknown> | undefined) ?? body;
      const inboundKey = (data.webhookKey ?? body.webhookKey) as string | undefined;
      if (inboundKey) {
        const { data: keyRows } = await this.service.rpc("get_grow_webhook_secret", {
          p_tenant_id: tenantIdFromBody,
        });
        const storedKey = Array.isArray(keyRows) && keyRows.length > 0
          ? (keyRows[0] as { webhook_secret: string }).webhook_secret
          : null;
        if (storedKey && inboundKey !== storedKey) {
          throw new Error("Grow webhook key mismatch — request rejected");
        }
      }
    }

    const parsed = parseGrowNotify(body);

    // Grow requires the merchant to acknowledge the transaction; always approve on success.
    if (parsed.event.type === "payment.succeeded") {
      // GAP 3: Replay protection — if this transaction reference already reached 'succeeded'
      // in our DB, skip approveTransaction and persistCardToken to prevent double-processing.
      const ref = parsed.event.providerPaymentRef;
      const { data: existing } = await this.service
        .from("payments")
        .select("id, status")
        .eq("provider_payment_ref", ref)
        .maybeSingle();

      if (existing?.status === "succeeded") {
        // Already finalised — return the event without triggering side-effects again.
        return parsed.event;
      }

      await this.approveTransaction(parsed.event.metadata.tenant_id, parsed);
      await this.persistCardToken(parsed.event.metadata, body);
    }

    return parsed.event;
  }

  /**
   * Grow returns the reusable card token on the initial enrolment notify (we set
   * saveCardToken=1 at charge time). Persist it as the billing account's default token so the
   * monthly billing job can charge renewals without a hosted page. No-op when the notify has no
   * token or a default already exists (the unique index allows one default per account).
   */
  private async persistCardToken(
    metadata: ParsedGrowNotify["event"]["metadata"],
    body: Record<string, unknown>,
  ): Promise<void> {
    if (metadata.charge_type !== "initial") return;
    const data = (body.data as Record<string, unknown> | undefined) ?? body;
    const token = (data.token ?? data.cardToken) as string | undefined;
    if (!token) return;

    const { data: existing } = await this.service
      .from("payment_method_tokens")
      .select("id")
      .eq("billing_account_id", metadata.billing_account_id)
      .is("revoked_at", null)
      .eq("is_default", true)
      .maybeSingle();
    if (existing) return;

    await this.service.from("payment_method_tokens").insert({
      tenant_id: metadata.tenant_id,
      billing_account_id: metadata.billing_account_id,
      provider: "grow",
      provider_token: token,
      card_brand: (data.cardBrand ?? data.brand) as string | undefined ?? null,
      last4: (data.cardSuffix ?? data.last4) as string | undefined ?? null,
      is_default: true,
    });
  }

  private async approveTransaction(tenantId: string, parsed: ParsedGrowNotify): Promise<void> {
    const creds = await this.getCredentials(tenantId);
    const res = await fetch(`${growApiBase()}/approveTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageCode: creds.pageCode,
        userId: creds.userId,
        apiKey: creds.apiKey,
        transactionId: parsed.transactionId,
        transactionToken: parsed.transactionToken,
        transactionTypeId: parsed.paymentType,
      }),
    });
    if (!res.ok) {
      throw new Error(`Grow approveTransaction failed (${res.status})`);
    }
  }

  async refundCharge(params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    const { data: payment } = await this.service
      .from("payments")
      .select("tenant_id")
      .eq("provider_payment_ref", params.providerPaymentRef)
      .maybeSingle();
    if (!payment?.tenant_id) {
      throw new Error("Payment not found for refund");
    }
    const creds = await this.getCredentials(payment.tenant_id as string);
    const res = await fetch(`${growApiBase()}/refundTransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pageCode: creds.pageCode,
        userId: creds.userId,
        apiKey: creds.apiKey,
        transactionId: params.providerPaymentRef,
        sum: growAmountFromMinor(params.amountMinor),
      }),
    });
    const json = (await res.json()) as { status?: number; data?: { refundId?: string | number } };
    if (!res.ok || json.status !== 1) {
      throw new Error("Grow refundTransaction failed");
    }
    return { providerRefundRef: String(json.data?.refundId ?? `grow_ref_${params.providerPaymentRef}`) };
  }
}
