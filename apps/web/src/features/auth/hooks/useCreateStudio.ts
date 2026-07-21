import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tenantOrigin } from '@/lib/tenantUrl';

export type CreateStudioPlan = 'essential' | 'professional';

export type CreateStudioVertical =
  | 'dance_studio'
  | 'music_school'
  | 'martial_arts'
  | 'fitness_studio'
  | 'beauty_clinic'
  | 'photography_studio'
  | 'yoga_studio'
  | 'tutor';

export type CreateStudioFormData = {
  studioName: string;
  subdomain: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  plan: CreateStudioPlan;
  vertical: CreateStudioVertical;
};

export type CreateStudioResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string };

/**
 * Mirrors provision_tenant(TEXT, TEXT, TEXT, TEXT, TEXT, UUID) in the database.
 * Param names must match the SQL signature exactly — PostgREST resolves by name.
 */
type ProvisionTenantArgs = {
  p_name: string;
  p_subdomain: string;
  p_plan: CreateStudioPlan;
  p_vertical: CreateStudioVertical;
  p_owner_email: string;
  p_owner_id: string;
};

export function useCreateStudio() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createStudio(data: CreateStudioFormData): Promise<CreateStudioResult> {
    setLoading(true);
    setError(null);

    try {
      // Step 1: Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            first_name: data.firstName,
            last_name: data.lastName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return { ok: false, message: authError.message };
      }

      const session = authData.session;
      const user = authData.user;

      if (!user) {
        const msg = 'Signup succeeded but no user returned.';
        setError(msg);
        return { ok: false, message: msg };
      }

      // Step 2: Provision tenant.
      // NOTE: provision_tenant is granted to service_role only — this browser call
      // fails with a permission error unless self-serve signup has been deliberately
      // re-enabled. Paid signup provisions server-side from the payment webhook
      // instead (SPEC §7). See VITE_ENABLE_SELF_SERVE_SIGNUP in router.tsx.
      const { error: rpcError } = await supabase.rpc(
        'provision_tenant',
        {
          p_name: data.studioName,
          p_subdomain: data.subdomain,
          p_plan: data.plan,
          p_vertical: data.vertical,
          p_owner_email: data.email,
          p_owner_id: user.id,
        } satisfies ProvisionTenantArgs,
      );

      if (rpcError) {
        setError(rpcError.message);
        return { ok: false, message: rpcError.message };
      }

      // Step 3: Build cross-subdomain redirect URL with session tokens in hash
      // SessionHandoffPage reads hash via establishSessionFromAuthCallback()
      const base = tenantOrigin(data.subdomain);

      if (session) {
        const hash = `#access_token=${session.access_token}&refresh_token=${session.refresh_token}&token_type=bearer`;
        return { ok: true, redirectUrl: `${base}/auth/session-handoff${hash}` };
      }

      // If Supabase email confirmation is enabled, session may be null.
      // Redirect to login with a query param so the login page can show a message.
      return {
        ok: true,
        redirectUrl: `${base}/login?registered=1`,
      };
    } finally {
      setLoading(false);
    }
  }

  return { createStudio, loading, error };
}
