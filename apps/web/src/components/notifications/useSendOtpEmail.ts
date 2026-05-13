import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { OtpEmailPayloadSchema } from '@shared/schemas';
import type { OtpEmailPayload } from '@shared/schemas';

interface SendOtpEmailResponse {
  success: boolean;
  messageId?: string;
  expiresInMinutes: number;
  error?: string;
}

/**
 * Hook: useSendOtpEmail
 * Calls send-otp-email Edge Function to send OTP via email
 * Returns messageId and expiry time
 */
export function useSendOtpEmail() {
  const mutation = useMutation<SendOtpEmailResponse, Error, OtpEmailPayload>({
    mutationFn: async (payload: OtpEmailPayload) => {
      // Validate payload
      const validatedPayload = OtpEmailPayloadSchema.parse(payload);

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('send-otp-email', {
        body: validatedPayload,
      });

      if (error) {
        throw new Error(error.message || 'Failed to send OTP email');
      }

      if (!data.success) {
        throw new Error(data.error || 'OTP email send failed');
      }

      return {
        success: true,
        messageId: data.messageId,
        expiresInMinutes: data.expiresInMinutes || 10,
      };
    },
  });

  return {
    sendOtp: mutation.mutate,
    sendOtpAsync: mutation.mutateAsync,
    isSending: mutation.isPending,
    error: mutation.error,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}
