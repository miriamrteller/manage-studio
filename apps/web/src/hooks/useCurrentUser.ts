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
} {
  const { session, isLoading: sessionLoading } = useAuthSession();

  const { data: userProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['currentUser', session?.user.id],
    queryFn: async () => {
      // No session = no user
      if (!session?.user.id) {
        return null;
      }

      // Fetch user_profile from DB (RLS will enforce tenant isolation)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.warn('Failed to fetch user profile:', error.message);
        return null;
      }

      return {
        ...data,
        email: session.user.email,
      } as UserProfile;
    },
    enabled: !!session?.user.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    user: userProfile || null,
    isLoading: sessionLoading || profileLoading,
  };
}
