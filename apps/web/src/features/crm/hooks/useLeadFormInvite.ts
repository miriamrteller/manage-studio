import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** The token from an admin's "Send form" link (#invite=…), or null. */
export function readInviteToken(hash: string): string | null {
  const m = /(?:^#|&)invite=([A-Za-z0-9_-]{32,128})(?:&|$)/.exec(hash);
  return m ? m[1] : null;
}

/**
 * An admin's "Send form" link prefills the form with the name and email the
 * admin typed: the link holds only a random token (in the fragment), looked up
 * here. The token is then removed from the address bar so it isn't bookmarked
 * or shared. Nothing (and no error) for a wrong or expired token.
 */
export function useLeadFormInvite(tenantId: string | null | undefined): {
  token: string | null;
  prefill: { name: string; email: string } | null;
} {
  const [token] = useState(() => (typeof window === 'undefined' ? null : readInviteToken(window.location.hash)));
  const [prefill, setPrefill] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }, [token]);

  useEffect(() => {
    if (!token || !tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_lead_form_invite', { p_tenant_id: tenantId, p_token: token });
        const row = data as { name?: string | null; email?: string | null } | null;
        if (!cancelled && row && typeof row === 'object') {
          setPrefill({ name: (row.name ?? '').trim(), email: (row.email ?? '').trim() });
        }
      } catch {
        // No prefill: the form simply starts blank.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tenantId]);

  return { token, prefill };
}
