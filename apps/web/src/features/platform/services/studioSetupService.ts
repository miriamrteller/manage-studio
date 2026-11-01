import { supabase } from '@/lib/supabase';

/** Payment choices, in the order the wizard shows them. Mirrors STUDIO_PAYMENT_PROVIDERS (edge). */
export const STUDIO_PAYMENT_OPTIONS = ['grow', 'icount', 'invoice4u', 'ypay', 'tranzila', 'offline'] as const;
/** Document choices. Mirrors STUDIO_INVOICING_PROVIDERS (edge). */
export const STUDIO_INVOICING_OPTIONS = [
  'grow',
  'icount',
  'invoice4u',
  'ypay',
  'tranzila',
  'yesh',
  'green_invoice',
  'none',
] as const;

export type StudioPaymentProvider = (typeof STUDIO_PAYMENT_OPTIONS)[number];
export type StudioInvoicingProvider = (typeof STUDIO_INVOICING_OPTIONS)[number];

export interface StudioSetupRequest {
  name: string;
  subdomain: string;
  plan: 'essential' | 'professional';
  vertical: string;
  ownerEmail: string;
  languageDefault: 'he' | 'en';
  country: 'IL' | 'US';
  currency: string;
  phoneRegion: string;
  paymentProvider: StudioPaymentProvider;
  invoicingProvider: StudioInvoicingProvider;
  primaryColor: string;
  accentColor: string;
}

export type OwnerInviteStatus =
  | { status: 'invited' }
  | { status: 'already_owner' }
  | { status: 'failed'; reason: 'email_in_other_studio' | 'email_is_platform_owner' | 'invite_failed'; message?: string };

export interface StudioSetupResult {
  tenantId: string;
  subdomain: string;
  owner: OwnerInviteStatus;
}

/** Error the server sent back, or a plain message. */
async function functionError(error: unknown): Promise<Error> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (context?.json) {
    try {
      const body = (await context.json()) as { error?: unknown };
      if (typeof body?.error === 'string') return new Error(body.error);
    } catch {
      // fall through to the generic message
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export async function createStudio(request: StudioSetupRequest): Promise<StudioSetupResult> {
  const { data, error } = await supabase.functions.invoke('provision-studio', {
    body: { action: 'provision', ...request },
  });
  if (error) throw await functionError(error);
  return data as StudioSetupResult;
}

export async function resendOwnerInvite(tenantId: string, ownerEmail: string): Promise<OwnerInviteStatus> {
  const { data, error } = await supabase.functions.invoke('provision-studio', {
    body: { action: 'invite_owner', tenantId, ownerEmail },
  });
  if (error) throw await functionError(error);
  return (data as { owner: OwnerInviteStatus }).owner;
}
