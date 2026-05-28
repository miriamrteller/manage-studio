import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthSession } from './useAuth';
import type { UserProfile } from '../types/auth';

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
} {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const profileQueryEnabled = !!session?.user.id && !sessionLoading;

  const {
    data: userProfile,
    isLoading: profileLoading,
    isFetched: profileFetched,
  } = useQuery({
    queryKey: ['currentUser', session?.user.id],
    queryFn: async () => {
      // Read session from the client at query time so the REST call carries the user JWT.
      const {
        data: { session: currentSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !currentSession?.user.id) {
        return null;
      }

      const { data, error } = await supabase.rpc('get_my_profile');

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
  });

  return {
    user: userProfile || null,
    isLoading:
      sessionLoading || (profileQueryEnabled && (profileLoading || !profileFetched)),
    isProfileChecked: !profileQueryEnabled || profileFetched,
  };
}
