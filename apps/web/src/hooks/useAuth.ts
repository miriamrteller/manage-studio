import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

/**
 * Internal auth hook: manages session state + auto-logout on 401
 * Used by useCurrentUser to detect when session expires
 */
export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Wait for INITIAL_SESSION so REST calls use the user JWT, not the anon key.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, updatedSession) => {
        setSession(updatedSession);
        setIsLoading(false);
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [navigate]);

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
