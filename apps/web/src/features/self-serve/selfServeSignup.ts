import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { tenantOrigin } from '@/lib/tenantUrl';
import { functionError, type StudioSetupRequest } from '@/features/platform/services/studioSetupService';

/**
 * Self-serve studio signup (free beta, no card) on app.opalswift.com.
 * Off unless VITE_ENABLE_SELF_SERVE_SIGNUP=true. The server has its own switch
 * (SELF_SERVE_SIGNUP_ENABLED on the provision-studio function).
 */
export function isSelfServeSignupEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_SELF_SERVE_SIGNUP === 'true';
}

export { turnstileSiteKey } from '@/components/captcha/useCaptcha';

/** user_metadata.signup on these accounts; send-auth-email brands their emails as OpalSwift. */
export const SELF_SERVE_SIGNUP_METADATA = 'self_serve_studio';

/** Where the confirmation link lands: this page reads the link and opens the wizard. */
export const SELF_SERVE_PATH = '/create-studio';

export interface SelfServeStartInput {
  email: string;
  firstName: string;
  lastName: string;
  language: 'he' | 'en';
  captchaToken?: string | null;
}

/**
 * Emails a confirmation link. The account is created now but has no studio and
 * no profile (handle_new_user) until the wizard creates the studio.
 */
export async function sendSelfServeConfirmation(input: SelfServeStartInput): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: input.email.trim().toLowerCase(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}${SELF_SERVE_PATH}`,
      data: {
        signup: SELF_SERVE_SIGNUP_METADATA,
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        language: input.language,
      },
      ...(input.captchaToken ? { captchaToken: input.captchaToken } : {}),
    },
  });
  if (error) throw error;
}

export type SelfServeStudioRequest = Omit<StudioSetupRequest, 'ownerEmail'> & {
  termsVersion: string;
  termsLanguage: 'he' | 'en';
  captchaToken?: string;
};

export interface SelfServeStudioResult {
  tenantId: string;
  subdomain: string;
}

/** Creates the signed-in account's studio (provision-studio, action "self_serve"). */
export async function createSelfServeStudio(request: SelfServeStudioRequest): Promise<SelfServeStudioResult> {
  const { data, error } = await supabase.functions.invoke('provision-studio', {
    body: { action: 'self_serve', ...request },
  });
  if (error) throw await functionError(error);
  return data as SelfServeStudioResult;
}

/**
 * Link that signs the owner in on their studio's own address: sessions are per
 * host, so the tokens travel in the URL fragment (never sent to a server) to
 * /auth/session-handoff there. Without a session, the studio's sign-in page.
 */
export function studioHandoffUrl(subdomain: string, session: Pick<Session, 'access_token' | 'refresh_token'> | null): string {
  const origin = tenantOrigin(subdomain);
  if (!session) return `${origin}/login`;
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
  });
  return `${origin}/auth/session-handoff#${hash.toString()}`;
}

/**
 * Open a studio's own address signed in, from app.<root> (the studio card on
 * the welcome page, "Go to your studio" after signup). The studio's address
 * takes over this session; it is dropped here (local only, not a sign-out of
 * the account) so the two hosts never refresh the same token, which would end
 * both sessions. Without a session, the studio's sign-in page opens.
 */
export async function openStudioSignedIn(subdomain: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const url = studioHandoffUrl(subdomain, data.session);
  if (data.session) await supabase.auth.signOut({ scope: 'local' });
  window.location.assign(url);
}
