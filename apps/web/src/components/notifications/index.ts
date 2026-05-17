/**
 * DEPRECATED: Notification components and hooks have been reorganized
 * 
 * Components moved to @/components/shared/:
 * - ContactPreferencesEditor
 * - WhatsAppOtpVerifier
 * - NotificationLog
 * 
 * Hooks moved to @/features/notifications/hooks/:
 * - useContactPreferences
 * - useSendOtpEmail
 * - useVerifyWhatsAppOtp
 * - useNotificationLog
 * 
 * This file exists only for backwards compatibility.
 * Please update your imports to use the new locations.
 */

// Re-export from new locations for backwards compatibility (to be removed)
export { ContactPreferencesEditor, WhatsAppOtpVerifier, NotificationLog } from '@/components/shared';
export {
  useContactPreferences,
  useSendOtpEmail,
  useVerifyWhatsAppOtp,
  useNotificationLog,
} from '@/features/notifications/hooks';
