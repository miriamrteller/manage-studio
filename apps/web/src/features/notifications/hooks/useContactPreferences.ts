import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ContactPreferencesSchema, ContactPreferencesUpdate } from '@shared/schemas';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import type { ContactPreferences } from '@shared/schemas';

export function contactPreferencesQueryKey(userId?: string, tenantId?: string) {
  return ['contactPreferences', userId, tenantId] as const;
}

/** Parents may match both person_id and account_member_id rows via RLS — prefer household row. */
export function pickContactPreferenceRow(
  rows: Record<string, unknown>[],
): ContactPreferences | null {
  if (rows.length === 0) return null;
  const parsed = rows.map((row) => ContactPreferencesSchema.parse(row));
  return parsed.find((row) => row.account_member_id) ?? parsed[0];
}

/**
 * Hook: useContactPreferences
 * Fetches and manages contact preferences for the current user.
 *
 * The contact_preferences table is keyed by person_id OR family_member_id (never user_profile_id).
 * RLS policy "users manage own preferences" enforces row access so we let RLS do the filtering;
 * we only need tenant_id for the insert default path.
 */
export function useContactPreferences(options?: { enabled?: boolean }) {
  const { user } = useCurrentUser();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const queryKey = contactPreferencesQueryKey(user?.id, tenant?.id);
  const queryEnabled = (options?.enabled ?? true) && !!user?.id && !!tenant?.id;

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<ContactPreferences> => {
      if (!user?.id || !tenant?.id) throw new Error('User not authenticated');

      // RLS may return multiple rows (e.g. guardian person + account_member for parents).
      const { data: rows, error } = await supabase
        .from('contact_preferences')
        .select('*')
        .eq('tenant_id', tenant.id);

      if (error) throw error;
      const existing = pickContactPreferenceRow(rows ?? []);
      if (existing) return existing;

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
          .from('account_members')
          .select('id')
          .eq('user_profile_id', user.id)
          .maybeSingle();

        if (member?.id) {
          newPrefs.account_member_id = member.id;
        } else {
          throw new Error('No person or account_member record found for this user');
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
    enabled: queryEnabled,
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: ContactPreferencesUpdate) => {
      if (!user?.id || !tenant?.id) throw new Error('User not authenticated');

      const current = queryClient.getQueryData<ContactPreferences>(queryKey);
      if (!current?.id) throw new Error('Contact preferences not loaded');

      const { data, error } = await supabase
        .from('contact_preferences')
        .update(updates)
        .eq('id', current.id)
        .select()
        .single();

      if (error) throw error;
      return ContactPreferencesSchema.parse(data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    error: query.error,
    updatePreferences: updateMutation.mutate,
    updatePreferencesAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}
