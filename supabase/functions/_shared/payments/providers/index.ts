/**
 * index.ts — providerFor() factory
 *
 * THE ONLY place that instantiates IPaymentProvider or IInvoicingProvider.
 * No component outside this module may import RapydAdapter or YeshInvoiceAdapter directly.
 * Adapter Mandate (be-adapter-spec v1.4.0 + build-plan §4.4)
 *
 * Secret resolution is injected via the SecretResolver interface so the vault
 * implementation (Supabase Vault, AWS Secrets Manager, etc.) is swappable.
 */

import type { IPaymentProvider, IInvoicingProvider, TenantProviderConfig } from './types.ts';
import { YeshInvoiceAdapter } from './yesh.ts';
import { RapydAdapter }       from './rapyd.ts';

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
        eq: (col: string, val: string) => Promise<{ data: Array<{ decrypted_secret: string }> | null; error: unknown }>;
      };
    };
  }) {}

  async resolve(vaultRef: string): Promise<string> {
    // Parse vault reference: "vault:secret/tenants/{id}/{provider}#{key_name}"
    if (!vaultRef.startsWith('vault:')) {
      throw new Error(`Invalid vault reference format: ${vaultRef}`);
    }

    const secretPath = vaultRef.replace('vault:', '');
    const { data, error } = await this.supabaseClient
      .from('vault.decrypted_secrets')
      .select('decrypted_secret')
      .eq('name', secretPath);

    if (error || !data?.[0]?.decrypted_secret) {
      throw new Error(`Failed to resolve secret: ${secretPath}`);
    }

    return data[0].decrypted_secret;
  }
}

/**
 * Creates the appropriate IPaymentProvider for the tenant.
 * ONLY this function may instantiate RapydAdapter (or any other payment adapter).
 */
export async function providerForPayment(
  tenant: TenantProviderConfig,
  secretResolver: SecretResolver
): Promise<IPaymentProvider> {
  switch (tenant.payment_provider) {
    case 'rapyd': {
      if (!tenant.rapyd_config) {
        throw new Error(`Tenant ${tenant.id} has payment_provider='rapyd' but no rapyd_config`);
      }
      const resolvedSecretKey = await secretResolver.resolve(tenant.rapyd_config.secret_key_ref);
      return new RapydAdapter({ ...tenant.rapyd_config, resolvedSecretKey });
    }

    case 'grow':
      // GrowAdapter is a future adapter — not yet implemented
      throw new Error('GrowAdapter not yet implemented');

    case 'icount_paypage':
      throw new Error('ICountPayPageAdapter not yet implemented');

    default:
      throw new Error(`Unknown payment provider: ${(tenant as TenantProviderConfig).payment_provider}`);
  }
}

/**
 * Creates the appropriate IInvoicingProvider for the tenant.
 * ONLY this function may instantiate YeshInvoiceAdapter (or any other invoicing adapter).
 */
export async function providerForInvoicing(
  tenant: TenantProviderConfig,
  secretResolver: SecretResolver
): Promise<IInvoicingProvider> {
  switch (tenant.invoicing_provider) {
    case 'yesh': {
      if (!tenant.yesh_config) {
        throw new Error(`Tenant ${tenant.id} has invoicing_provider='yesh' but no yesh_config`);
      }
      const resolvedApiKey = await secretResolver.resolve(tenant.yesh_config.api_key_ref);
      return new YeshInvoiceAdapter({ ...tenant.yesh_config, resolvedApiKey });
    }

    case 'icount':
      throw new Error('ICountInvoicingAdapter not yet implemented');

    default:
      throw new Error(`Unknown invoicing provider: ${(tenant as TenantProviderConfig).invoicing_provider}`);
  }
}
