import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import type { SignupForm } from '@/schemas/auth';

export function useSignup() {
  const queryClient = useQueryClient();
  const tenant = useTenant();

  const sendOtpMutation = useMutation({
    mutationFn: async (data: SignupForm) => {
      if (data.channel === 'email') {
        const response = await fetch('/api/functions/send-otp-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: data.email,
            recipient_name: `${data.firstName} ${data.lastName}`,
            tenant_id: data.tenantId,
          }),
        });
        return response.json();
      } else {
        const response = await fetch('/api/functions/send-otp-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient_phone: data.phone,
            recipient_name: `${data.firstName} ${data.lastName}`,
            channel: data.channel,
            tenant_id: data.tenantId,
          }),
        });
        return response.json();
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
      const response = await fetch('/api/functions/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_point: contactPoint,
          code,
          channel,
          tenant_id: tenant?.id,
        }),
      });
      return response.json();
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
