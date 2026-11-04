import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthSession } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { resolveAuthErrorMessage } from '@/lib/authErrors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where both confirmation emails return (the callback confirms, then shows the result). */
export function emailChangeRedirect(origin: string = window.location.origin): string {
  const url = new URL(`${origin}/auth/callback`);
  url.searchParams.set('next', 'email-change');
  return url.toString();
}

type Status =
  | { kind: 'idle' }
  | { kind: 'sent'; to: string; from: string }
  | { kind: 'refused'; reason: 'taken' | 'reserved' | 'same' | 'invalid' }
  | { kind: 'error'; message: string };

/**
 * "Change login email" (Settings → Security, and the client/parent portals).
 * Supabase's secure email change: a confirmation goes to BOTH addresses and the login
 * changes only once both are confirmed; the old login keeps working until then.
 * A studio admin can also move the studio's business email to the new login
 * (applied by the database when the change is confirmed).
 */
export function ChangeLoginEmail({ businessEmail }: { businessEmail?: string | null }) {
  const { t } = useTranslation();
  const id = useId();
  const { session } = useAuthSession();
  const current = session?.user.email ?? '';
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Ticked when the business email still equals the login (it was copied from it).
  const offerBusiness = businessEmail !== undefined;
  const sameAsLogin = !!businessEmail && !!current && businessEmail.trim().toLowerCase() === current.trim().toLowerCase();
  const [alsoBusiness, setAlsoBusiness] = useState(sameAsLogin);
  useEffect(() => setAlsoBusiness(sameAsLogin), [sameAsLogin]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = email.trim().toLowerCase();
    if (!EMAIL_RE.test(next)) {
      setStatus({ kind: 'refused', reason: 'invalid' });
      return;
    }
    setBusy(true);
    setStatus({ kind: 'idle' });
    try {
      const { data: check, error: checkError } = await supabase.rpc('login_email_status', { p_email: next });
      if (checkError) throw checkError;
      if (check === 'taken' || check === 'reserved' || check === 'same' || check === 'invalid') {
        setStatus({ kind: 'refused', reason: check });
        return;
      }
      const { error } = await supabase.auth.updateUser(
        { email: next, data: { business_email_follow: offerBusiness && alsoBusiness } },
        { emailRedirectTo: emailChangeRedirect() },
      );
      if (error) {
        // Supabase's own "already registered" answer, if another account got it meanwhile.
        if (/already|exists|registered/i.test(error.message)) {
          setStatus({ kind: 'refused', reason: 'taken' });
          return;
        }
        throw error;
      }
      setStatus({ kind: 'sent', to: next, from: current });
      setEmail('');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setStatus({ kind: 'error', message: resolveAuthErrorMessage(message, t, 'login_email.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium">{t('login_email.change_title')}</h3>
      <p className="text-sm text-muted-foreground">{t('login_email.change_description')}</p>
      <form className="space-y-2" noValidate onSubmit={(e) => void onSubmit(e)}>
        <label htmlFor={`${id}-email`} className="block text-sm font-medium">
          {t('login_email.new_label')}
        </label>
        <input
          id={`${id}-email`}
          type="email"
          dir="ltr"
          autoComplete="email"
          className="form-input w-full max-w-md"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {offerBusiness && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={alsoBusiness} onChange={(e) => setAlsoBusiness(e.target.checked)} />
            <span>{t('login_email.also_business')}</span>
          </label>
        )}
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={busy} isLoading={busy}>
            {t('login_email.send')}
          </Button>
        </div>
      </form>
      {status.kind === 'sent' && (
        <p role="status" className="text-sm">
          {t('login_email.sent', { to: status.to, from: status.from })}
        </p>
      )}
      {status.kind === 'refused' && (
        <p role="alert" className="text-sm text-red-700">
          {t(`login_email.refused_${status.reason}`)}
        </p>
      )}
      {status.kind === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {status.message}
        </p>
      )}
    </div>
  );
}

/** The portals' version: a button opens it in a dialog, next to "Login password". */
export function ChangeLoginEmailDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t('login_email.change_title')}</DialogTitle>
          <DialogDescription>{t('login_email.dialog_description')}</DialogDescription>
        </DialogHeader>
        <ChangeLoginEmail />
      </DialogContent>
    </Dialog>
  );
}
