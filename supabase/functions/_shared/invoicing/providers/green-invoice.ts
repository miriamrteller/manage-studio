import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { z } from "npm:zod@3.22.4";
import { refreshInvoicingToken } from "../refresh-token.ts";
import type {
  AuthHealthResult,
  CanonicalDocumentInput,
  DocumentKind,
  ExternalDocumentResult,
  InvoicingProvider,
} from "../types.ts";
import { InvoicingProviderError } from "../types.ts";

const TokenResponseSchema = z.object({
  token: z.string(),
  expires: z.number().optional(),
});

const DocumentResponseSchema = z.object({
  id: z.string(),
  number: z.union([z.string(), z.number()]),
  url: z.object({ origin: z.string(), href: z.string() }).optional(),
  urlOrigin: z.string().optional(),
});

function apiBase(): string {
  return Deno.env.get("GREEN_INVOICE_API_BASE") ?? "https://api.greeninvoice.co.il/api/v1";
}

function giDocumentType(kind: DocumentKind): number {
  return kind === "refund" ? 330 : 320;
}

export class GreenInvoiceProvider implements InvoicingProvider {
  readonly slug = "green_invoice";

  async authenticate(service: SupabaseClient, tenantId: string): Promise<void> {
    await refreshInvoicingToken(service, tenantId, this);
  }

  async issueDocument(
    service: SupabaseClient,
    input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    const token = await refreshInvoicingToken(service, input.tenantId, this);
    const base = apiBase();

    const body: Record<string, unknown> = {
      type: giDocumentType(input.documentKind),
      lang: input.language,
      currency: input.currency,
      vatType: 0,
      income: [
        {
          description: input.documentKind === "refund" ? "Credit note" : "Payment",
          quantity: 1,
          price: input.totalAmountMinor / 100,
          vatType: 0,
        },
      ],
      client: {
        name: input.payer.name,
        emails: input.payer.email ? [input.payer.email] : [],
        ...(input.buyer?.businessTaxId
          ? { taxId: input.buyer.businessTaxId, add: true, self: false }
          : {}),
      },
    };

    if (input.documentKind === "refund" && input.originalExternalDocumentId) {
      body.linkedDocumentIds = [input.originalExternalDocumentId];
    }

    const res = await fetch(`${base}/documents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status >= 400 && res.status < 500) {
      const text = await res.text();
      throw new InvoicingProviderError(`GI documents ${res.status}: ${text}`, {
        retryable: false,
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new InvoicingProviderError(`GI documents ${res.status}: ${text}`, {
        retryable: true,
      });
    }

    const parsed = DocumentResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new InvoicingProviderError("GI documents: invalid response shape", {
        retryable: false,
      });
    }

    const doc = parsed.data;
    const href = doc.url?.href ?? doc.urlOrigin ?? `${base}/documents/${doc.id}`;
    return {
      externalDocumentId: doc.id,
      externalDocumentNumber: String(doc.number),
      documentUrl: href,
    };
  }

  async checkAuthHealth(
    service: SupabaseClient,
    tenantId: string,
  ): Promise<AuthHealthResult> {
    try {
      await refreshInvoicingToken(service, tenantId, this);
      const { data } = await service
        .from("tenants")
        .select("invoicing_auth_valid_until")
        .eq("id", tenantId)
        .single();
      return {
        valid: true,
        validUntil: (data?.invoicing_auth_valid_until as string | null) ?? undefined,
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : "Auth check failed",
      };
    }
  }

  /** Exchange API key + secret for bearer token (used by refreshInvoicingToken). */
  async fetchToken(service: SupabaseClient, tenantId: string): Promise<{ token: string; expiresAt: string }> {
    const { data: creds, error } = await service.rpc("get_tenant_invoicing_credentials", {
      p_tenant_id: tenantId,
    });
    if (error || !creds?.[0]) {
      throw new InvoicingProviderError("Invoicing credentials not configured", {
        retryable: false,
      });
    }
    const row = creds[0] as {
      invoicing_api_key: string | null;
      invoicing_secret: string | null;
    };
    if (!row.invoicing_api_key || !row.invoicing_secret) {
      throw new InvoicingProviderError("Invoicing API key or secret missing", {
        retryable: false,
      });
    }

    const res = await fetch(`${apiBase()}/account/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.invoicing_api_key, secret: row.invoicing_secret }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new InvoicingProviderError(`GI token ${res.status}: ${text}`, {
        retryable: res.status >= 500,
      });
    }

    const parsed = TokenResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new InvoicingProviderError("GI token: invalid response shape", { retryable: false });
    }

    const expiresMs = parsed.data.expires
      ? parsed.data.expires * 1000
      : Date.now() + 3600 * 1000;
    return {
      token: parsed.data.token,
      expiresAt: new Date(expiresMs).toISOString(),
    };
  }
}
