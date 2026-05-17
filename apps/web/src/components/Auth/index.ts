/**
 * DEPRECATED: Auth components and hooks have been reorganized
 * 
 * Components moved to @/components/shared/:
 * - LoginForm
 * - AuthMessage
 * 
 * Hooks moved to:
 * - useLogin → @/hooks/useLogin (shared hook)
 * - useSignup → @/features/auth/hooks/useSignup (feature-specific)
 * 
 * This file exists only for backwards compatibility.
 * Please update your imports to use the new locations.
 */

// Re-export from new locations for backwards compatibility (to be removed)
export { LoginForm } from '@/components/shared';
export { AuthMessage } from '@/components/shared';
export { useLogin } from '@/hooks/useLogin';
export { useSignup } from '@/features/auth/hooks/useSignup';
