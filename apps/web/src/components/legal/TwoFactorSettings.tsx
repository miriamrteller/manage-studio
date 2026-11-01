import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

interface TotpFactor {
  id: string;
  friendly_name?: string | null;
  status: string;
}

interface Enrolment {
  factorId: string;
  qrCode: string;
  secret: string;
}

/**
 * Two-step sign-in (TOTP, Supabase Auth MFA) for a studio admin's own account
 * (docs/legal/11-security-procedure §4.3). Once a verified factor exists, the
 * admin area asks for a code at sign-in (MfaChallengeGate).
 */
export function TwoFactorSettings({ onEnabled }: { onEnabled?: () => void } = {}) {
  const { t } = useTranslation();
  const [factors, setFactors] = useState<TotpFactor[] | null>(null);
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mfa = supabase.auth.mfa;

  const load = async () => {
    if (!mfa) {
      setFactors([]);
      return;
    }
    const { data, error } = await mfa.listFactors();
    if (error) {
      setMessage(error.message);
      setFactors([]);
      return;
    }
    setFactors(((data?.totp ?? []) as TotpFactor[]).filter((f) => f.status === 'verified'));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEnrolment = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await mfa.enroll({ factorType: 'totp', friendlyName: `OpalSwift ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) {
      setMessage(error?.message ?? t('common.error'));
      return;
    }
    setEnrolment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirmEnrolment = async () => {
    if (!enrolment) return;
    setBusy(true);
    setMessage(null);
    const { error } = await mfa.challengeAndVerify({ factorId: enrolment.factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setMessage(t('legal.security.mfa_wrong_code'));
      return;
    }
    setEnrolment(null);
    setCode('');
    setMessage(t('legal.security.mfa_enabled'));
    await load();
    onEnabled?.();
  };

  const remove = async (factorId: string) => {
    setBusy(true);
    const { error } = await mfa.unenroll({ factorId });
    setBusy(false);
    setMessage(error ? error.message : t('legal.security.mfa_removed'));
    await load();
  };

  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="mfa-heading">
      <h3 id="mfa-heading" className="font-medium">
        {t('legal.security.mfa_title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('legal.security.mfa_description')}</p>

      {factors === null && <p role="status">{t('common.loading')}</p>}

      {factors && factors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('legal.security.mfa_on')}</p>
          {factors.map((f) => (
            <div key={f.id} className="flex items-center gap-3 text-sm">
              <span>{f.friendly_name ?? 'Authenticator'}</span>
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void remove(f.id)}>
                {t('legal.security.mfa_remove')}
              </Button>
            </div>
          ))}
        </div>
      )}

      {factors && factors.length === 0 && !enrolment && (
        <Button type="button" variant="primary" disabled={busy || !mfa} onClick={() => void startEnrolment()}>
          {t('legal.security.mfa_start')}
        </Button>
      )}

      {enrolment && (
        <div className="space-y-3">
          <p className="text-sm">{t('legal.security.mfa_scan')}</p>
          <img src={enrolment.qrCode} alt={t('legal.security.mfa_qr_alt')} width={180} height={180} />
          <p className="text-xs text-muted-foreground break-all" dir="ltr">
            {t('legal.security.mfa_secret')}: {enrolment.secret}
          </p>
          <label htmlFor="mfa-code" className="block text-sm font-medium">
            {t('legal.security.mfa_code_label')}
          </label>
          <input
            id="mfa-code"
            className="form-input w-40"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <div>
            <Button type="button" variant="primary" disabled={busy || code.length !== 6} onClick={() => void confirmEnrolment()}>
              {t('legal.security.mfa_confirm')}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
