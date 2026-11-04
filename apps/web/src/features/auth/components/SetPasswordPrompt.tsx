import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { SetPasswordDialog } from '@/components/shared/SetPasswordDialog';
import { useAuthSession } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { sessionIdOf, sessionUsedPassword } from '@/features/auth/lib/sessionAuthMethod';

const DISMISSED_KEY = 'opalswift.setPasswordPrompt.dismissedSession';

function dismissedFor(sessionId: string | null): boolean {
  if (!sessionId) return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === sessionId;
  } catch {
    return false;
  }
}

function rememberDismissed(sessionId: string | null) {
  if (!sessionId) return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, sessionId);
  } catch {
    // Storage blocked: the prompt may show again on the next page, which is harmless.
  }
}

export const hasPasswordQueryKey = (userId: string | undefined) => ['my-login-has-password', userId];

/**
 * After sign-in, offers to set a login password to anyone who has none yet
 * (signed in by email link, code or Google). "Not now" hides it until the next
 * sign-in. Never blocks: if the check fails, nothing is shown.
 */
export function SetPasswordPrompt() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { session } = useAuthSession();
  const sessionId = sessionIdOf(session);
  const userId = session?.user.id;
  const [closed, setClosed] = useState(false);

  // A password sign-in proves there is a password, so there is nothing to ask.
  const needsCheck = !!userId && !sessionUsedPassword(session) && !dismissedFor(sessionId);

  const { data: hasPassword } = useQuery({
    queryKey: hasPasswordQueryKey(userId),
    enabled: needsCheck,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_login_has_password');
      if (error) {
        console.warn('[SetPasswordPrompt] password check failed; not prompting', error.message);
        return true;
      }
      return data === true;
    },
  });

  const open = needsCheck && hasPassword === false && !closed;

  return (
    <SetPasswordDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        rememberDismissed(sessionId);
        setClosed(true);
      }}
      setTitle={t('auth.set_password_prompt.title')}
      setDescription={t('auth.set_password_prompt.description')}
      cancelLabel={t('auth.set_password_prompt.not_now')}
      onSaved={() => queryClient.setQueryData(hasPasswordQueryKey(userId), true)}
    />
  );
}
