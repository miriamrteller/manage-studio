import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

/**
 * Admin area: when the signed-in admin has two-step sign-in set up but this
 * session hasn't passed it yet (aal1 → aal2), ask for the authenticator code.
 * Fails open if the MFA API is unavailable, so a backend hiccup never locks
 * admins out.
 */
export function MfaChallengeGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mfa-assurance'],
    retry: false,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const mfa = supabase.auth.mfa;
      if (!mfa?.getAuthenticatorAssuranceLevel) return { needsCode: false, factorId: null as string | null };
      const { data: aal, error: aalError } = await mfa.getAuthenticatorAssuranceLevel();
      if (aalError || !aal) return { needsCode: false, factorId: null };
      if (!(aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2')) return { needsCode: false, factorId: null };
      const { data: factors } = await mfa.listFactors();
      const factor = (factors?.totp ?? []).find((f) => f.status === 'verified');
      return { needsCode: !!factor, factorId: factor?.id ?? null };
    },
  });

  if (isLoading || !data?.needsCode || !data.factorId) return <>{children}</>;

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: data.factorId!,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(t('legal.security.mfa_wrong_code'));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['mfa-assurance'] });
  };

  return (
    <section className="max-w-sm mx-auto my-10 rounded-lg border p-6 space-y-4" aria-labelledby="mfa-challenge-title">
      <h1 id="mfa-challenge-title" className="text-xl font-semibold">
        {t('legal.security.challenge_title')}
      </h1>
      <p className="text-sm">{t('legal.security.challenge_body')}</p>
      <label htmlFor="mfa-challenge-code" className="block text-sm font-medium">
        {t('legal.security.mfa_code_label')}
      </label>
      <input
        id="mfa-challenge-code"
        className="form-input w-40"
        inputMode="numeric"
        autoComplete="one-time-code"
        dir="ltr"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button variant="primary" disabled={busy || code.length !== 6} onClick={() => void verify()}>
        {t('legal.security.challenge_submit')}
      </Button>
    </section>
  );
}
