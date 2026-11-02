import { isPlatformAppHost, resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import { isPlatformOwnerEmail } from '@/lib/platformOwner';

export interface LoginOtpOptions {
  shouldCreateUser: boolean;
  data: Record<string, string>;
}

/**
 * Who may sign in by email from this host, and what the new-session metadata says.
 * - A studio host: its subdomain; never creates an account (studios invite people).
 * - The platform host (app.<root>): no studio. Only the platform owner may get an
 *   account here; the database refuses any other subdomain-less signup too.
 * - Anything else: null (the host names no studio and is not the platform host).
 */
export function loginOtpOptions(email: string, language: string): LoginOtpOptions | null {
  const subdomain = resolveTenantSubdomain();
  if (subdomain) return { shouldCreateUser: false, data: { subdomain } };
  if (isPlatformAppHost()) {
    return {
      shouldCreateUser: isPlatformOwnerEmail(email),
      data: { language: language.startsWith('he') ? 'he' : 'en' },
    };
  }
  return null;
}
