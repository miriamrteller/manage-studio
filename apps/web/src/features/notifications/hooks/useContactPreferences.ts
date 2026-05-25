import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ContactPreferencesSchema, ContactPreferencesUpdate } from '@shared/schemas';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import type { ContactPreferences } from '@shared/schemas';

/**
 * Hook: useContactPreferences
 * Fetches and manages contact preferences for the current user.
 *
 * The contact_preferences table is keyed by person_id OR family_member_id (never user_profile_id).
 * RLS policy "users manage own preferences" enforces row access so we let RLS do the filtering;
 * we only need tenant_id for the insert default path.
 */
export function useContactPreferences() {
  const { user } = useCurrentUser();
  const tenant = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['contactPreferences', user?.id, tenant?.id],
    queryFn: async (): Promise<ContactPreferences> => {
      if (!user?.id || !tenant?.id) throw new Error('User not authenticated');

      // RLS returns only the row owned by this user (via person_id or family_member_id).
      const { data, error } = await supabase
        .from('contact_preferences')
        .select('*')
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (error) throw error;
      if (data) return ContactPreferencesSchema.parse(data);

      // No row yet — determine whether the user is a people record or a family_member.
      const { data: person } = await supabase
        .from('people')
        .select('id')
        .eq('user_profile_id', user.id)
        .maybeSingle();

      const newPrefs: Record<string, unknown> = {
        tenant_id: tenant.id,
        email_opted_in: true,
        whatsapp_opted_in: false,
        whatsapp_verified: false,
        preferred_channel: 'email',
        language: 'he',
      };

      if (person?.id) {
        newPrefs.person_id = person.id;
      } else {
        const { data: member } = await supabase
          .from('family_members')
          .select('id')
          .eq('user_profile_id', user.id)
          .maybeSingle();

        if (member?.id) {
          newPrefs.family_member_id = member.id;
        } else {
          throw new Error('No person or family_member record found for this user');
        }
      }

      const { data: created, error: createError } = await supabase
        .from('contact_preferences')
        .insert(newPrefs)
        .select()
        .single();

      if (createError) throw createError;
      return ContactPreferencesSchema.parse(created);
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: ContactPreferencesUpdate) => {
      if (!user?.id || !tenant?.id) throw new Error('User not authenticated');

      // RLS ensures this updates only the user's own row.
      const { data, error } = await supabase
        .from('contact_preferences')
        .update(updates)
        .eq('tenant_id', tenant.id)
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
