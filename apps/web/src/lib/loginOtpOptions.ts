import { isPlatformAppHost, resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';

export interface LoginOtpOptions {
  shouldCreateUser: boolean;
  data: Record<string, string>;
}

/**
 * Who may sign in by email from this host, and what the new-session metadata says.
 * - A studio host: its subdomain; never creates an account (studios invite people).
 * - The platform host (app.<root>): no studio and no account is created from the sign-in
 *   page. The platform owner's account already exists (who the owner is lives in the
 *   database, platform_owner_emails, not in the app), and the database refuses any other
 *   subdomain-less signup anyway.
 * - Anything else: null (the host names no studio and is not the platform host).
 */
export function loginOtpOptions(language: string): LoginOtpOptions | null {
  const subdomain = resolveTenantSubdomain();
  if (subdomain) return { shouldCreateUser: false, data: { subdomain } };
  if (isPlatformAppHost()) {
    return {
      shouldCreateUser: false,
      data: { language: language.startsWith('he') ? 'he' : 'en' },
    };
  }
  return null;
}
