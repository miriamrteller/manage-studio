import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  InvoicingProviderError,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * Yesh invoicing adapter for the main provider architecture.
 *
 * Yesh (יש חשבונית) is invoicing-only — it issues tax documents but does not clear
 * payments, so a tenant pairs it with a separate payment provider.
 *
 * Credentials come from get_tenant_yesh_credentials (company_id + encrypted api_key),
 * the same encrypted-column pattern the other providers use.
 */
export class YeshInvoicingProvider implements InvoicingProvider {
  readonly slug = "yesh";

  private async getCredentials(
    service: SupabaseClient,
    tenantId: string,
  ): Promise<{ companyId: string; apiKey: string }> {
    const { data, error } = await service.rpc("get_tenant_yesh_credentials", {
      p_tenant_id: tenantId,
    });
    const row = data?.[0] as { company_id: string | null; api_key: string | null } | undefined;

    if (error || !row?.company_id || !row.api_key) {
      throw new InvoicingProviderError("Yesh credentials not configured", { retryable: false });
    }
    return { companyId: row.company_id, apiKey: row.api_key };
  }

  async authenticate(service: SupabaseClient, tenantId: string): Promise<void> {
    // Yesh authenticates per-request with the API key; presence is the check.
    await this.getCredentials(service, tenantId);
  }

  async issueDocument(
    service: SupabaseClient,
    input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    void (await this.getCredentials(service, input.tenantId));
    // The live HTTP client lands with the Yesh go-live stage; failing loudly is
    // better than silently reporting a document that was never issued.
    throw new InvoicingProviderError(
      "Yesh issueDocument is not implemented yet — credentials resolve, but the live " +
        "document call is pending Yesh API access.",
      { retryable: false },
    );
  }

  async checkAuthHealth(service: SupabaseClient, tenantId: string) {
    try {
      const { companyId } = await this.getCredentials(service, tenantId);
      return { valid: true, message: `Yesh credentials present for company ${companyId}.` };
    } catch (error) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
