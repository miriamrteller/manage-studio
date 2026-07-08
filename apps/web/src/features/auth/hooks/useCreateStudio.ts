import { useState } from 'react';
import { supabase } from '@/lib/supabase';

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

type ProvisionTenantV2Args = {
  p_subdomain: string;
  p_display_name: string;
  p_owner_id: string;
  p_plan: CreateStudioPlan;
  p_vertical: CreateStudioVertical;
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

      // Step 2: Provision tenant
      const { error: rpcError } = await supabase.rpc(
        'provision_tenant_v2',
        {
          p_subdomain: data.subdomain,
          p_display_name: data.studioName,
          p_owner_id: user.id,
          p_plan: data.plan,
          p_vertical: data.vertical,
        } satisfies ProvisionTenantV2Args,
      );

      if (rpcError) {
        setError(rpcError.message);
        return { ok: false, message: rpcError.message };
      }

      // Step 3: Build cross-subdomain redirect URL with session tokens in hash
      // SessionHandoffPage reads hash via establishSessionFromAuthCallback()
      if (session) {
        const base = `http://${data.subdomain}.localhost:5173`;
        const hash = `#access_token=${session.access_token}&refresh_token=${session.refresh_token}&token_type=bearer`;
        return { ok: true, redirectUrl: `${base}/auth/session-handoff${hash}` };
      }

      // If Supabase email confirmation is enabled, session may be null.
      // Redirect to login with a query param so the login page can show a message.
      return {
        ok: true,
        redirectUrl: `http://${data.subdomain}.localhost:5173/login?registered=1`,
      };
    } finally {
      setLoading(false);
    }
  }

  return { createStudio, loading, error };
}
