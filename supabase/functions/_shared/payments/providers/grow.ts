import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.105.3";
import { getEnv } from "../../edge-runtime/env.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";
import { growAmountFromMinor, minorFromGrowAmount } from "../grow/amount.ts";
import { fromGrowCustomFields, peekGrowTenantId, toGrowCustomFields } from "../grow/metadata.ts";
import { insertPendingGrowPayment, markPendingGrowPaymentFailed } from "../grow/pending-charge.ts";

interface GrowCredentials {
  userId: string;
  pageCode: string;
  apiKey: string;
  /**
   * Tenant business license / tax ID for Grow invoice.
   * null = omit pageField[invoiceLicenseNumber] from payload (field not configured).
   */
  invoiceLicenseNumber: string | null;
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

/**
 * Grow API base URL. Required: there is no default, so a missing setting fails loudly instead
 * of sending live money to the sandbox. Dev and CI set GROW_MOCK and never reach this.
 */
export function growApiBase(): string {
  const base = getEnv("GROW_API_BASE")?.trim();
  if (!base) {
    throw new Error("GROW_API_BASE is not set — Grow is not configured on this server");
  }
  return base.replace(/\/+$/, "");
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

  const succeeded = String(status) === "1" || status === 1;

  const event: PaymentEvent = {
    type: succeeded ? "payment.succeeded" : "payment.failed",
    providerPaymentRef,
    metadata,
    amountMinor,
    currency: "ILS",
    pretaxAmountMinor: 0,
    vatAmountMinor: 0,
    vatRate: 0,
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

/** Thrown when an inbound Grow notify fails pre-shared webhook key validation. */
export class GrowWebhookKeyError extends Error {}

/** Constant-time string compare, so the key cannot be guessed one character at a time. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

/** The webhook key Grow sent, from the body (`webhookKey`) or the nested `data` object. */
export function readGrowInboundKey(body: Record<string, unknown>): string | undefined {
  const data = (body.data as Record<string, unknown> | undefined) ?? body;
  const key = data.webhookKey ?? body.webhookKey;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

/**
 * Authenticate an inbound Grow notify (payment or document) against the tenant's pre-shared
 * webhook key (`grow_webhook_secrets`, encrypted, rotatable). Fails closed:
 *   - no key stored for the tenant → rejected (the studio has not finished connecting Grow);
 *   - key missing from the notify → rejected;
 *   - key does not match any active key → rejected.
 * During a rotation both the new key and the previous one (for 24 hours) are accepted.
 */
export async function verifyGrowWebhookKey(
  service: SupabaseClient,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const { data: keyRows, error } = await service.rpc("get_grow_webhook_secret", {
    p_tenant_id: tenantId,
  });
  if (error) {
    throw new GrowWebhookKeyError("Grow webhook key could not be loaded — request rejected");
  }
  const storedKeys = (Array.isArray(keyRows) ? keyRows : [])
    .map((row) => (row as { webhook_secret?: string | null }).webhook_secret)
    .filter((key): key is string => typeof key === "string" && key.length > 0);
  if (storedKeys.length === 0) {
    throw new GrowWebhookKeyError(
      "Grow webhook key not configured for this studio — request rejected",
    );
  }

  const inboundKey = readGrowInboundKey(body);
  // Compare against every active key without stopping early.
  let matched = false;
  for (const key of storedKeys) {
    if (inboundKey !== undefined && timingSafeEqual(inboundKey, key)) matched = true;
  }
  if (!matched) {
    throw new GrowWebhookKeyError("Grow webhook key mismatch — request rejected");
  }
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
      .select("payment_provider_account_id, invoice_license_number")
      .eq("id", tenantId)
      .single();

    if (!cred.payment_provider_public_key || !tenant?.payment_provider_account_id) {
      throw new Error("Grow page code or user id not configured");
    }

    return {
      userId: tenant.payment_provider_account_id as string,
      pageCode: cred.payment_provider_public_key,
      apiKey: cred.payment_provider_secret_key,
      invoiceLicenseNumber: (tenant.invoice_license_number as string | null) ?? null,
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

    // Pending row first (D5): the notify is checked against it (tenant, engagement, amount).
    const { paymentId } = await insertPendingGrowPayment(this.service, {
      transactionUniqueIdentifier: params.idempotencyKey,
      amountMinor: params.amountMinor,
      currency: params.currency,
      metadata: params.metadata,
    });

    try {
      // Recurring renewals reuse the saved card token (server-to-server, no hosted page). The
      // charge still confirms via the notify webhook, so we return pendingWebhook like the
      // hosted-page path rather than finalising inline.
      if (params.savedToken) {
        return await this.chargeWithSavedToken(params, creds);
      }
      return await this.createHostedCharge(params, creds);
    } catch (err) {
      await markPendingGrowPaymentFailed(this.service, paymentId);
      throw err;
    }
  }

  private async createHostedCharge(
    params: ChargeParams,
    creds: GrowCredentials,
  ): Promise<ChargeResult> {
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
      // Save the card token on the first (enrolment) charge so renewals can reuse it (G6), and
      // on a card-link charge, where a parent adds a card to an active monthly plan.
      saveCardToken: params.metadata.charge_type === "initial" || params.saveCard ? 1 : 0,
      ...(notifyUrl ? { notifyUrl } : {}),
      // The studio's tax ID for the Grow document, passed through as entered. No VAT type is
      // sent: Grow applies the VAT rules of the owner's own Grow account, and the amount is
      // the gross price as entered (business status never changes what we send).
      ...(creds.invoiceLicenseNumber
        ? { "pageField[invoiceLicenseNumber]": creds.invoiceLicenseNumber }
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

  private async chargeWithSavedToken(
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
        // Same as createCharge: tax ID passed through, no VAT type.
        ...(creds.invoiceLicenseNumber
          ? { "pageField[invoiceLicenseNumber]": creds.invoiceLicenseNumber }
          : {}),
        ...toGrowCustomFields(params.metadata),
      }),
    });
    const json = (await res.json()) as { status?: number; err?: { message?: string } };
    if (!res.ok || json.status !== 1) {
      throw new Error(json.err?.message ?? "Grow token charge failed");
    }
    return { providerPaymentRef: params.idempotencyKey, pendingWebhook: true };
  }

  /**
   * Not used for Grow: payment notices are settled by `processGrowNotify` (grow/process-notify.ts),
   * which checks the webhook key, compares the notice with our pending row and approves the
   * transaction. Throwing here keeps the unchecked generic path closed.
   */
  constructEvent(_rawBody: string, _headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    return Promise.reject(
      new Error("Grow notices are handled by processGrowNotify, not constructEvent"),
    );
  }

  /**
   * Grow returns the reusable card token on the initial enrolment notify (we set
   * saveCardToken=1 at charge time). Persist it as the billing account's default token so the
   * monthly billing job can charge renewals without a hosted page. No-op when the notify has no
   * token or a default already exists (the unique index allows one default per account).
   */
  async persistCardToken(
    metadata: ParsedGrowNotify["event"]["metadata"],
    body: Record<string, unknown>,
  ): Promise<void> {
    if (metadata.charge_type !== "initial" && metadata.save_card !== "1") return;
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

  /**
   * Grow requires the merchant to acknowledge each successful transaction. Only a response with
   * `status: 1` counts; anything else throws so the payment stays pending (fail closed).
   */
  async approveTransaction(tenantId: string, parsed: ParsedGrowNotify): Promise<void> {
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
    const json = (await res.json().catch(() => ({}))) as {
      status?: number | string;
      err?: { message?: string };
    };
    if (!res.ok || String(json.status) !== "1") {
      throw new Error(
        `Grow approveTransaction failed (${res.status}${json.err?.message ? `: ${json.err.message}` : ""})`,
      );
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
