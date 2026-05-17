import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import type { SignupForm } from '@/schemas/auth';

export function useSignup() {
  const queryClient = useQueryClient();
  const tenant = useTenant();

  const sendOtpMutation = useMutation({
    mutationFn: async (data: SignupForm) => {
      if (data.channel === 'email') {
        const { data: response, error } = await supabase.functions.invoke('send-otp-email', {
          body: {
            email: data.email,
            recipient_name: `${data.firstName} ${data.lastName}`,
            tenant_id: data.tenantId,
          },
        });
        if (error) throw error;
        return response;
      } else {
        const { data: response, error } = await supabase.functions.invoke('send-otp-sms', {
          body: {
            recipient_phone: data.phone,
            recipient_name: `${data.firstName} ${data.lastName}`,
            channel: data.channel,
            tenant_id: data.tenantId,
          },
        });
        if (error) throw error;
        return response;
      }
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
    sendOtpLoading: sendOtpMutation.isPending,
    sendOtpError: sendOtpMutation.error,
    verifyOtp: verifyOtpMutation.mutate,
    verifyOtpLoading: verifyOtpMutation.isPending,
    verifyOtpError: verifyOtpMutation.error,
  };
}
