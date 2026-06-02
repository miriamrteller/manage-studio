/** Tells send-auth-email which login email layout to use (read from emailRedirectTo). */
export type LoginEmailMethod = 'magic_link' | 'code';

export function buildAuthCallbackRedirect(loginMethod?: LoginEmailMethod): string {
  const url = new URL(`${window.location.origin}/auth/callback`);
  if (loginMethod) {
    url.searchParams.set('login_method', loginMethod);
  }
  return url.toString();
}
