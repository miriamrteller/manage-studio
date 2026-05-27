import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { resolveTenantSubdomain } from '@/lib/resolveTenantSubdomain';
import { useTenant } from '@/hooks/useTenant';
import type { SignupForm } from '@/schemas/auth';

export function useSignup() {
  const queryClient = useQueryClient();
  const tenant = useTenant();

  const sendOtpMutation = useMutation({
    mutationFn: async (data: SignupForm) => {
      if (!tenant?.id) {
        throw new Error('Tenant not loaded');
      }

      if (data.channel === 'email') {
        const subdomain = resolveTenantSubdomain();
        if (!subdomain) {
          throw new Error('Could not determine school subdomain');
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: data.email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            data: {
              subdomain,
              first_name: data.firstName,
              last_name: data.lastName,
            },
          },
        });

        if (error) throw error;
        return { success: true };
      }

      const { data: response, error } = await supabase.functions.invoke('send-otp-sms', {
        body: {
          recipient_phone: data.phone,
          recipient_name: `${data.firstName} ${data.lastName}`,
          channel: data.channel,
          tenant_id: tenant.id,
        },
      });
      if (error) throw error;
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signup-state'] });
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async ({
      contactPoint,
      code,
      channel,
    }: {
      contactPoint: string;
      code: string;
      channel: 'email' | 'sms' | 'whatsapp';
    }) => {
      const { data: response, error } = await supabase.functions.invoke('verify-otp', {
        body: {
          contact_point: contactPoint,
          code,
          channel,
          tenant_id: tenant?.id,
        },
      });
      if (error) throw error;
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['signup-state'] });
    },
  });

  return {
    sendOtp: sendOtpMutation.mutate,
    sendOtpAsync: sendOtpMutation.mutateAsync,
    sendOtpLoading: sendOtpMutation.isPending,
    sendOtpError: sendOtpMutation.error,
    verifyOtp: verifyOtpMutation.mutate,
    verifyOtpLoading: verifyOtpMutation.isPending,
    verifyOtpError: verifyOtpMutation.error,
  };
}
