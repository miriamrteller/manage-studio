import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthSession } from './useAuth';
import { AUTH_WAIT_MS, withTimeout } from '../lib/withTimeout';
import type { UserProfile } from '../types/auth';

/** The profile call did not answer in time (the session itself is fine). Not retried: waiting again is the same wait. */
export class ProfileTimeoutError extends Error {
  constructor() {
    super('Profile did not load in time');
    this.name = 'ProfileTimeoutError';
  }
}

/**
 * Fetches current user profile from Supabase auth + user_profiles table
 * - Returns null if no auth session
 * - Caches user data with TanStack Query
 * - Re-fetches when session changes
 * - Includes role array for multi-role support
 */
export function useCurrentUser(): {
  user: UserProfile | null;
  isLoading: boolean;
  isProfileChecked: boolean;
  /** True when the profile call timed out on a valid session: the page can offer "try again". */
  profileTimedOut: boolean;
} {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const profileQueryEnabled = !!session?.user.id && !sessionLoading;

  const {
    data: userProfile,
    isLoading: profileLoading,
    isFetched: profileFetched,
    error: profileError,
  } = useQuery({
    queryKey: ['currentUser', session?.user.id],
    queryFn: async () => {
      // Read session from the client at query time so the REST call carries the user JWT.
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await withTimeout(supabase.auth.getSession(), AUTH_WAIT_MS, {
        data: { session: null },
        error: null,
      });

      if (sessionError || !currentSession?.user.id) {
        return null;
      }

      const rpcResult = await withTimeout(supabase.rpc('get_my_profile'), AUTH_WAIT_MS * 2, null);
      if (rpcResult === null) {
        console.warn('Profile did not load in time');
        throw new ProfileTimeoutError();
      }
      const { data, error } = rpcResult;

      if (error?.code === 'PGRST202') {
        // RPC not deployed yet — fall back to direct table read
        const tableResult = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', currentSession.user.id)
          .maybeSingle();

        if (tableResult.error) {
          console.warn(
            'Failed to fetch user profile:',
            tableResult.error.code,
            tableResult.error.message,
          );
          return null;
        }

        if (!tableResult.data) {
          console.warn('No user_profiles row for auth user:', currentSession.user.id);
          return null;
        }

        return {
          ...tableResult.data,
          email: currentSession.user.email,
        } as UserProfile;
      }

      if (error) {
        console.warn(
          'Failed to fetch user profile:',
          error.code,
          error.message,
        );
        return null;
      }

      const profileRow = Array.isArray(data) ? data[0] : data;
      if (!profileRow) {
        console.warn('No user_profiles row for auth user:', currentSession.user.id);
        return null;
      }

      return {
        ...profileRow,
        email: currentSession.user.email,
      } as UserProfile;
    },
    enabled: profileQueryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => !(error instanceof ProfileTimeoutError) && failureCount < 1,
  });

  return {
    user: userProfile || null,
    isLoading:
      sessionLoading || (profileQueryEnabled && (profileLoading || !profileFetched)),
    isProfileChecked: !profileQueryEnabled || profileFetched,
    profileTimedOut: profileError instanceof ProfileTimeoutError,
  };
}
