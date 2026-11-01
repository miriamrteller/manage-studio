import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { TwoFactorSettings } from './TwoFactorSettings';

type GateState =
  | { mode: 'pass'; factorId: null }
  | { mode: 'challenge'; factorId: string }
  | { mode: 'enrol'; factorId: null };

const PASS: GateState = { mode: 'pass', factorId: null };

/**
 * Admin area:
 *  - the admin has two-step sign-in set up but this session hasn't passed it
 *    yet (aal1 → aal2): ask for the authenticator code;
 *  - the studio requires two-step sign-in (tenants.require_admin_mfa) and the
 *    admin has no verified factor: show the enrolment screen instead of the
 *    admin area. Super-admins are not bound by a studio's setting.
 * Fails open on any API error, so a backend hiccup never locks admins out.
 */
export function MfaChallengeGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const tenant = useTenant();
  const tenantId = tenant?.id ?? null;
  const isSuperAdmin = !!user?.role?.includes('super_admin');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['mfa-assurance', tenantId, isSuperAdmin],
    retry: false,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<GateState> => {
      const mfa = supabase.auth.mfa;
      if (!mfa?.getAuthenticatorAssuranceLevel) return PASS;
      const { data: aal, error: aalError } = await mfa.getAuthenticatorAssuranceLevel();
      if (aalError || !aal) return PASS;
      if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
        const { data: factors } = await mfa.listFactors();
        const factor = (factors?.totp ?? []).find((f) => f.status === 'verified');
        return factor ? { mode: 'challenge', factorId: factor.id } : PASS;
      }
      if (aal.currentLevel === 'aal2' || isSuperAdmin || !tenantId) return PASS;

      // No second step yet: does this studio require one?
      const { data: row, error: rowError } = await supabase
        .from('tenants')
        .select('require_admin_mfa')
        .eq('id', tenantId)
        .maybeSingle();
      if (rowError || row?.require_admin_mfa !== true) return PASS;
      const { data: factors, error: factorsError } = await mfa.listFactors();
      if (factorsError) return PASS;
      const hasFactor = (factors?.totp ?? []).some((f) => f.status === 'verified');
      return hasFactor ? PASS : { mode: 'enrol', factorId: null };
    },
  });

  if (isLoading || !data || data.mode === 'pass') return <>{children}</>;

  const recheck = () => queryClient.invalidateQueries({ queryKey: ['mfa-assurance'] });

  if (data.mode === 'enrol') {
    return (
      <section className="max-w-lg mx-auto my-10 space-y-4" aria-labelledby="mfa-enrol-title">
        <h1 id="mfa-enrol-title" className="text-xl font-semibold">
          {t('legal.security.enrol_required_title')}
        </h1>
        <p className="text-sm">{t('legal.security.enrol_required_body')}</p>
        <TwoFactorSettings onEnabled={() => void recheck()} />
      </section>
    );
  }

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: data.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(t('legal.security.mfa_wrong_code'));
      return;
    }
    await recheck();
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
