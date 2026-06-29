import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getEnv } from "../../env.ts";
import type { ChargeParams, ChargeResult, PaymentEvent, PaymentProvider } from "../types.ts";

interface IcountCredentials {
  companyId: string;
  pageId: string;
  apiToken: string;
}

function amountForCcPage(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

/** Build CC page redirect URL per SPIKE-ADR (help docs — no REST charge API). */
export function buildIcountChargeRedirectUrl(params: {
  pageId: string;
  amountMinor: number;
  description: string;
  tenantId: string;
  engagementId: string;
  successUrl?: string;
  ipnUrl?: string;
}): string {
  const query = new URLSearchParams({
    cs: amountForCcPage(params.amountMinor),
    cd: params.description,
    m__tenant_id: params.tenantId,
    m__engagement_id: params.engagementId,
  });
  if (params.successUrl) query.set("success_url", params.successUrl);
  if (params.ipnUrl) query.set("ipn_url", params.ipnUrl);
  return `https://app.icount.co.il/m/${params.pageId}?${query.toString()}`;
}

/**
 * iCount payment adapter — CC page redirect + IPN (Option A′).
 * Live IPN parsing lands in I2b after I0-live capture.
 */
export class IcountPaymentProvider implements PaymentProvider {
  readonly slug = "icount";

  constructor(private readonly service: SupabaseClient) {}

  private async getCredentials(tenantId: string): Promise<IcountCredentials> {
    const { data: creds, error } = await this.service.rpc("get_tenant_payment_credentials", {
      p_tenant_id: tenantId,
    });
    if (error || !creds?.[0]?.payment_provider_secret_key) {
      throw new Error("iCount credentials not configured");
    }

    const { data: tenant } = await this.service
      .from("tenants")
      .select("payment_provider_account_id, payment_provider_public_key")
      .eq("id", tenantId)
      .single();

    const pageId = tenant?.payment_provider_public_key as string | null;
    const companyId = tenant?.payment_provider_account_id as string | null;
    if (!pageId || !companyId) {
      throw new Error("iCount company id or CC page id not configured");
    }

    return {
      companyId,
      pageId,
      apiToken: (creds[0] as { payment_provider_secret_key: string }).payment_provider_secret_key,
    };
  }

  async createCharge(params: ChargeParams): Promise<ChargeResult> {
    const creds = await this.getCredentials(params.metadata.tenant_id);
    const providerPaymentRef = `icount_pending_${crypto.randomUUID()}`;
    const pageUrl = buildIcountChargeRedirectUrl({
      pageId: creds.pageId,
      amountMinor: params.amountMinor,
      description: "OpalSwift enrolment",
      tenantId: params.metadata.tenant_id,
      engagementId: params.metadata.engagement_id,
      ipnUrl: getEnv("ICOUNT_NOTIFY_URL"),
    });

    return { providerPaymentRef, pageUrl, pendingWebhook: true };
  }

  async chargeWithToken(_params: ChargeParams): Promise<ChargeResult> {
    throw new Error("iCount chargeWithToken pending I0-live / I4-live");
  }

  async constructEvent(_rawBody: string, _headers: Headers, _tenantId: string): Promise<PaymentEvent> {
    throw new Error("iCount IPN parser requires I0-live capture (I2b)");
  }

  async refundCharge(_params: {
    providerPaymentRef: string;
    amountMinor: number;
  }): Promise<{ providerRefundRef: string }> {
    throw new Error("iCount refund adapter pending I0-live / I4");
  }

  async verifyCredentials(_tenantId: string): Promise<{ valid: boolean; message: string }> {
    throw new Error("iCount verifyCredentials requires live API (I2b)");
  }
}
