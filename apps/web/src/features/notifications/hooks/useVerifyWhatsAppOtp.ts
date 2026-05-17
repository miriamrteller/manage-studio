import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { VerifyWhatsAppOtpPayloadSchema } from '@shared/schemas';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import type { VerifyWhatsAppOtpPayload } from '@shared/schemas';

interface VerifyOtpResponse {
  success: boolean;
  verified: boolean;
  phone: string;
  error?: string;
}

/**
 * Hook: useVerifyWhatsAppOtp
 * Calls verify-whatsapp-otp Edge Function to verify WhatsApp OTP
 * Updates contact_preferences.whatsapp_verified on success
 */
export function useVerifyWhatsAppOtp() {
  const { user } = useCurrentUser();
  const tenant = useTenant();

  const mutation = useMutation<VerifyOtpResponse, Error, Omit<VerifyWhatsAppOtpPayload, 'tenantId'>>({
    mutationFn: async (payload: Omit<VerifyWhatsAppOtpPayload, 'tenantId'>) => {
      if (!user?.id || !tenant?.id) {
        throw new Error('User or tenant not found');
      }

      // Add tenantId to payload
      const fullPayload: VerifyWhatsAppOtpPayload = {
        ...payload,
        tenantId: tenant.id,
      };

      // Validate payload
      const validatedPayload = VerifyWhatsAppOtpPayloadSchema.parse(fullPayload);

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('verify-whatsapp-otp', {
        body: validatedPayload,
      });

      if (error) {
        throw new Error(error.message || 'Failed to verify OTP');
      }

      if (!data.success) {
        throw new Error(data.error || 'OTP verification failed');
      }

      return {
        success: true,
        verified: data.verified,
        phone: data.phone,
      };
    },
  });

  return {
    verifyOtp: mutation.mutate,
    verifyOtpAsync: mutation.mutateAsync,
    isVerifying: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    data: mutation.data,
    reset: mutation.reset,
  };
}
