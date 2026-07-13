/**
 * index.ts — providerFor() factory
 *
 * THE ONLY place that instantiates IPaymentProvider or IInvoicingProvider.
 * No component outside this module may import adapter classes directly.
 * Adapter Mandate: be-adapter-spec v1.4.0 + Tranzila be-adapter-spec v2.1.0
 *
 * Secret resolution is injected via the SecretResolver interface so the vault
 * implementation (Supabase Vault, AWS Secrets Manager, etc.) is swappable.
 *
 * NA-1 FIX (PA-TRZ-002): Per-tenant Tranzila credentials are resolved from
 * vault:secret/tenants/{tenantId}/tranzila#app_key / #secret_key.
 * TRANZILA_STO_TERMINAL_NAME is a platform-level env var for OpalSwift's own
 * subscription billing only — it is NOT per-tenant. There is no single global
 * TRANZILA_SECRET var.
 * Rotation: per-tenant vault credentials rotate as needed (tenant self-service or
 * admin-initiated). TRANZILA_STO_TERMINAL_NAME rotated quarterly via CI/CD pipeline.
 */

import type { IPaymentProvider, IInvoicingProvider, TenantProviderConfig } from "./types.ts";
import { YeshInvoiceAdapter }              from "./yesh.ts";
import { RapydAdapter }                    from "./rapyd.ts";
import { TranzilaPaymentAdapter }          from "./tranzila.ts";
import { TranzilaInvoicingAdapter }        from "./tranzila-invoicing.ts";
import { MockTranzilaPaymentAdapter }      from "./mock-tranzila.ts";
import { MockTranzilaInvoicingAdapter }    from "./mock-tranzila-invoicing.ts";

/**
 * SecretResolver — provider-agnostic vault interface.
 * ⚠️ Day-1 Infrastructure Task: select vault product and implement this interface.
 * Options: Supabase Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager.
 */
export interface SecretResolver {
  resolve(vaultRef: string): Promise<string>;
}

/**
 * Supabase Vault implementation of SecretResolver.
 * Uses Supabase's built-in vault.decrypted_secrets view.
 */
export class SupabaseVaultResolver implements SecretResolver {
  constructor(private readonly supabaseClient: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => Promise<{
          data: Array<{ decrypted_secret: string }> | null;
          error: unknown;
        }>;
      };
    };
  }) {}

  async resolve(vaultRef: string): Promise<string> {
    if (!vaultRef.startsWith("vault:")) {
      throw new Error(`Invalid vault reference format: ${vaultRef}`);
    }
    const secretPath = vaultRef.replace("vault:", "");
    const { data, error } = await this.supabaseClient
      .from("vault.decrypted_secrets")
      .select("decrypted_secret")
      .eq("name", secretPath);

    if (error || !data?.[0]?.decrypted_secret) {
      throw new Error(`Failed to resolve secret: ${secretPath}`);
    }
    return data[0].decrypted_secret;
  }
}

/**
 * Creates the appropriate IPaymentProvider for the tenant.
 * ONLY this function may instantiate RapydAdapter, TranzilaPaymentAdapter, etc.
 */
export async function providerForPayment(
  tenant: TenantProviderConfig,
  secretResolver: SecretResolver,
): Promise<IPaymentProvider> {
  switch (tenant.payment_provider) {
    case "rapyd": {
      if (!tenant.rapyd_config) {
        throw new Error(`Tenant ${tenant.id} has payment_provider='rapyd' but no rapyd_config`);
      }
      const resolvedSecretKey = await secretResolver.resolve(tenant.rapyd_config.secret_key_ref);
      return new RapydAdapter({ ...tenant.rapyd_config, resolvedSecretKey });
    }

    case "tranzila": {
      if (!tenant.tranzila_config) {
        throw new Error(
          `Tenant ${tenant.id} has payment_provider='tranzila' but no tranzila_config`,
        );
      }
      // Use mock in CI/dev — no live Tranzila terminal required
      if (Deno.env.get("TRANZILA_MOCK") === "true") {
        return new MockTranzilaPaymentAdapter();
      }
      return new TranzilaPaymentAdapter({
        tenantId:        tenant.id,
        terminalName:    tenant.tranzila_config.terminal_name,
        secretResolver,
        supabaseClient:  tenant.supabaseClient,
      });
    }

    case "grow":
      throw new Error("GrowAdapter not yet implemented");

    case "icount_paypage":
      throw new Error("ICountPayPageAdapter not yet implemented");

    default: {
      const _exhaustive: never = tenant.payment_provider;
      return _exhaustive;
    }
  }
}

/**
 * Creates the appropriate IInvoicingProvider for the tenant.
 * ONLY this function may instantiate YeshInvoiceAdapter, TranzilaInvoicingAdapter, etc.
 */
export async function providerForInvoicing(
  tenant: TenantProviderConfig,
  secretResolver: SecretResolver,
): Promise<IInvoicingProvider> {
  switch (tenant.invoicing_provider) {
    case "yesh": {
      if (!tenant.yesh_config) {
        throw new Error(`Tenant ${tenant.id} has invoicing_provider='yesh' but no yesh_config`);
      }
      const resolvedApiKey = await secretResolver.resolve(tenant.yesh_config.api_key_ref);
      return new YeshInvoiceAdapter({ ...tenant.yesh_config, resolvedApiKey });
    }

    case "tranzila": {
      if (!tenant.tranzila_config) {
        throw new Error(
          `Tenant ${tenant.id} has invoicing_provider='tranzila' but no tranzila_config`,
        );
      }
      if (Deno.env.get("TRANZILA_MOCK") === "true") {
        return new MockTranzilaInvoicingAdapter();
      }
      if (!tenant.supabaseClient) {
        throw new Error("supabaseClient required for TranzilaInvoicingAdapter");
      }
      return new TranzilaInvoicingAdapter({
        tenantId:       tenant.id,
        terminalName:   tenant.tranzila_config.terminal_name,
        secretResolver,
        supabaseClient: tenant.supabaseClient,
      });
    }

    case "icount":
      throw new Error("ICountInvoicingAdapter not yet implemented");

    default: {
      const _exhaustive: never = tenant.invoicing_provider;
      return _exhaustive;
    }
  }
}
