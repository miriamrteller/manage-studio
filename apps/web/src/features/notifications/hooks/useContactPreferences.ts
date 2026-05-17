import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ContactPreferencesSchema, ContactPreferencesUpdate } from '@shared/schemas';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import type { ContactPreferences } from '@shared/schemas';

/**
 * Hook: useContactPreferences
 * Fetches and manages contact preferences for the current user
 * Supports updating email/WhatsApp preferences
 */
export function useContactPreferences() {
  const { user } = useCurrentUser();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  // Query: Fetch contact preferences
  const query = useQuery({
    queryKey: ['contactPreferences', user?.id, tenant?.id],
    queryFn: async (): Promise<ContactPreferences> => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('contact_preferences')
        .select('*')
        .eq('user_profile_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No preferences found, create defaults
          const newPrefs = {
            user_profile_id: user.id,
            email_opted_in: true,
            whatsapp_opted_in: false,
            whatsapp_verified: false,
          };

          const { data: created, error: createError } = await supabase
            .from('contact_preferences')
            .insert(newPrefs)
            .select()
            .single();

          if (createError) throw createError;
          return ContactPreferencesSchema.parse(created);
        }
        throw error;
      }

      return ContactPreferencesSchema.parse(data);
    },
    enabled: !!user?.id,
  });

  // Mutation: Update contact preferences
  const updateMutation = useMutation({
    mutationFn: async (updates: ContactPreferencesUpdate) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('contact_preferences')
        .update(updates)
        .eq('user_profile_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return ContactPreferencesSchema.parse(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['contactPreferences', user?.id, tenant?.id],
      });
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updatePreferences: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}
