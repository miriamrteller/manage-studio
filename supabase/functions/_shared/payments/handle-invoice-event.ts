import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { parseInvoicingProviderSlug } from "../invoicing/registry.ts";
import { applyBundledDocumentNotify } from "./bundled-document.ts";
import { peekGrowTenantId } from "./grow/metadata.ts";
import {
  parseIcountDocumentWebhook,
  peekIcountDocumentPaymentRef,
} from "./icount/document.ts";
import { parseGrowInvoiceNotify } from "./providers/grow.ts";

function isGrowDocumentBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  return Boolean(peekGrowTenantId(body as Record<string, unknown>));
}

function isIcountDocumentBody(body: unknown): boolean {
  return peekIcountDocumentPaymentRef(body) !== undefined;
}

export type HandleInvoiceEventResult =
  | { ok: true; paymentId: string; duplicate: boolean }
  | { ok: false; status: 400 | 409; error: string };

async function resolveTenantForDocumentWebhook(
  service: SupabaseClient,
  body: unknown,
): Promise<{ tenantId: string } | { error: string; status: 400 | 409 }> {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const growTenantId = peekGrowTenantId(body as Record<string, unknown>);
    if (growTenantId) {
      return { tenantId: growTenantId };
    }
  }

  const paymentRef = peekIcountDocumentPaymentRef(body);
  if (!paymentRef) {
    return { error: "Unable to route document webhook", status: 400 };
  }

  const { data: payment, error } = await service
    .from("payments")
    .select("tenant_id")
    .eq("provider_payment_ref", paymentRef)
    .maybeSingle();

  if (error) throw error;
  if (!payment?.tenant_id) {
    return { error: "Payment not found for document", status: 409 };
  }

  return { tenantId: payment.tenant_id as string };
}

function mapApplyResult(
  result: Awaited<ReturnType<typeof applyBundledDocumentNotify>>,
): HandleInvoiceEventResult {
  if (result.status === "payment_not_found") {
    return { ok: false, status: 409, error: "Payment not found for document" };
  }
  return {
    ok: true,
    paymentId: result.paymentId,
    duplicate: result.status === "duplicate",
  };
}

/**
 * Document webhook orchestration — dispatch parser by tenant `invoicing_provider` slug.
 * Grow and iCount bundled document notifies share apply logic via applyBundledDocumentNotify.
 */
export async function handleInvoiceEventInternal(
  service: SupabaseClient,
  rawBody: string,
): Promise<HandleInvoiceEventResult> {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }

  const routing = await resolveTenantForDocumentWebhook(service, body);
  if ("error" in routing) {
    return { ok: false, status: routing.status, error: routing.error };
  }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("invoicing_provider")
    .eq("id", routing.tenantId)
    .single();

  if (tenantError || !tenant) {
    return { ok: false, status: 409, error: `Tenant not found: ${routing.tenantId}` };
  }

  const invoicingSlug = parseInvoicingProviderSlug(tenant.invoicing_provider as string);

  if (invoicingSlug === "grow" && isIcountDocumentBody(body) && !isGrowDocumentBody(body)) {
    return {
      ok: false,
      status: 400,
      error: "Document webhook body does not match tenant invoicing provider",
    };
  }

  if (invoicingSlug === "icount" && isGrowDocumentBody(body) && !isIcountDocumentBody(body)) {
    return {
      ok: false,
      status: 400,
      error: "Document webhook body does not match tenant invoicing provider",
    };
  }

  try {
    if (invoicingSlug === "grow") {
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new Error("Grow invoice notify expected object body");
      }
      const parsed = parseGrowInvoiceNotify(body as Record<string, unknown>);
      const result = await applyBundledDocumentNotify(service, parsed);
      return mapApplyResult(result);
    }

    if (invoicingSlug === "icount") {
      const parsed = parseIcountDocumentWebhook(body, routing.tenantId);
      const result = await applyBundledDocumentNotify(service, parsed);
      return mapApplyResult(result);
    }

    return {
      ok: false,
      status: 409,
      error: "Invoicing provider does not accept document webhooks",
    };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: error instanceof Error ? error.message : "Webhook parse error",
    };
  }
}
