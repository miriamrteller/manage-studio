import { supabase } from '@/lib/supabase';
import { parseFunctionInvokeBody } from '@/lib/parseFunctionInvokeError';

/**
 * OpalSwift support (owner decision, 11 Nov 2026: support access can do
 * everything a studio admin can, logged).
 *
 * After the confirm step on a studio's own address, the platform owner's
 * session there is swapped for the studio's "OpalSwift support" login: an
 * ordinary admin of that one studio (platform-support-session Edge Function).
 * Every page it opens and every change it makes is in the studio's OpalSwift
 * access log. app.opalswift.com keeps the platform owner's own session: each
 * address keeps its own sign-in.
 */

export async function enterStudioAsSupport(tenantId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('platform-support-session', {
    body: { tenantId },
  });
  const body = await parseFunctionInvokeBody(data, error);
  if (body?.error === 'two_step_required') throw new Error('two_step_required');
  if (error || body?.ok !== true || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
    throw new Error('failed');
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (sessionError) throw new Error('failed');
}

/** The studio's OpalSwift support login (see enterStudioAsSupport). */
export function isSupportLogin(user: { is_platform_support?: boolean | null } | null | undefined): boolean {
  return user?.is_platform_support === true;
}
