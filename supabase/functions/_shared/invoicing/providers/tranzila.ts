import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  InvoicingProviderError,
  type CanonicalDocumentInput,
  type ExternalDocumentResult,
  type InvoicingProvider,
} from "../types.ts";

/**
 * Tranzila invoicing adapter for the main provider architecture.
 *
 * Tranzila can both clear payments and issue documents, so a tenant may run
 * tranzila/tranzila bundled (like grow/grow) or pair it with another invoicer.
 *
 * Credentials come from get_tenant_tranzila_credentials.
 */
export class TranzilaInvoicingProvider implements InvoicingProvider {
  readonly slug = "tranzila";

  private async getCredentials(
    service: SupabaseClient,
    tenantId: string,
  ): Promise<{ terminalName: string; appKey: string; secretKey: string }> {
    const { data, error } = await service.rpc("get_tenant_tranzila_credentials", {
      p_tenant_id: tenantId,
    });
    const row = data?.[0] as
      | { terminal_name: string | null; app_key: string | null; secret_key: string | null }
      | undefined;

    if (error || !row?.terminal_name || !row.app_key || !row.secret_key) {
      throw new InvoicingProviderError("Tranzila credentials not configured", { retryable: false });
    }
    return {
      terminalName: row.terminal_name,
      appKey: row.app_key,
      secretKey: row.secret_key,
    };
  }

  async authenticate(service: SupabaseClient, tenantId: string): Promise<void> {
    await this.getCredentials(service, tenantId);
  }

  async issueDocument(
    service: SupabaseClient,
    input: CanonicalDocumentInput,
  ): Promise<ExternalDocumentResult> {
    void (await this.getCredentials(service, input.tenantId));
    throw new InvoicingProviderError(
      "Tranzila issueDocument is not implemented yet — credentials resolve, but the live " +
        "document call is pending a Tranzila invoicing terminal.",
      { retryable: false },
    );
  }

  async checkAuthHealth(service: SupabaseClient, tenantId: string) {
    try {
      const { terminalName } = await this.getCredentials(service, tenantId);
      return { valid: true, message: `Tranzila credentials present for terminal ${terminalName}.` };
    } catch (error) {
      return { valid: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}
