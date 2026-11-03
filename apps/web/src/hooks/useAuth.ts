import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { AUTH_WAIT_MS, withTimeout } from '../lib/withTimeout';

/**
 * Internal auth hook: manages session state + auto-logout on 401
 * Used by useCurrentUser to detect when session expires
 */
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    let mounted = true;

    // Never wait forever: a saved session whose refresh never answers would leave every page that
    // waits on this on "Loading...". After the limit we carry on signed out; a late answer still
    // arrives through onAuthStateChange below.
    void withTimeout(supabase.auth.getSession(), AUTH_WAIT_MS, null)
      .then((result) => {
        if (!mounted) return;
        if (result === null) console.warn('[auth] session did not load in time; continuing signed out');
        setSession(result ? result.data.session : null);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        console.warn('[auth] could not read the session:', err instanceof Error ? err.message : err);
        setSession(null);
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, updatedSession) => {
      setSession(updatedSession);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, isLoading };
}

/**
 * Helper: detects 401 errors and redirects to login
 * Suppresses redirect if already on login page
 */
export function useHandleUnauth() {
  const navigate = useNavigate();

  return (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 401
    ) {
      // Only redirect if not already on login page
      if (!window.location.pathname.includes('/login')) {
        navigate('/login', { replace: true });
      }
    }
  };
}
