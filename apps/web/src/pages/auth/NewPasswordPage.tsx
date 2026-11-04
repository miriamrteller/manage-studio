import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { createSetPasswordFormSchema } from '@/schemas';
import { resolveAuthErrorMessage } from '@/lib/authErrors';

/**
 * /auth/new-password: where a "Forgot password?" email lands (through /auth/callback,
 * which signs the person in from the link). They choose a new password; emailed links
 * and codes keep working as before.
 */
export default function NewPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const id = useId();
  const { session, isLoading } = useAuthSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const checked = createSetPasswordFormSchema(t, false).safeParse({ password, confirmPassword: confirm });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? t('pages.portal.password.error_save'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSaved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(resolveAuthErrorMessage(message, t, 'pages.portal.password.error_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-3xl font-bold text-primary text-center">{t('pages.new_password.title')}</h1>

        {isLoading ? (
          <p role="status">{t('common.loading')}</p>
        ) : !session ? (
          <div className="space-y-3 text-center">
            <p>{t('pages.new_password.no_session')}</p>
            <Link className="underline" to="/login?mode=password">
              {t('pages.new_password.back_to_login')}
            </Link>
          </div>
        ) : saved ? (
          <div className="space-y-3 text-center">
            <p role="status">{t('pages.new_password.saved')}</p>
            <Button type="button" variant="primary" fullWidth onClick={() => navigate('/dashboard', { replace: true })}>
              {t('pages.new_password.continue')}
            </Button>
          </div>
        ) : (
          <form className="space-y-4" noValidate onSubmit={(e) => void onSubmit(e)}>
            <p className="text-gray-600 text-center">
              {t('pages.new_password.intro', { email: session.user.email ?? '' })}
            </p>
            <div className="space-y-1">
              <label htmlFor={`${id}-new`} className="block text-sm font-medium">
                {t('pages.portal.password.new')}
              </label>
              <input
                id={`${id}-new`}
                type="password"
                autoComplete="new-password"
                className="form-input w-full"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={`${id}-req`}
              />
              <p id={`${id}-req`} className="text-xs text-muted-foreground">
                {t('pages.portal.password.requirements')}
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor={`${id}-confirm`} className="block text-sm font-medium">
                {t('pages.portal.password.confirm')}
              </label>
              <input
                id={`${id}-confirm`}
                type="password"
                autoComplete="new-password"
                className="form-input w-full"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" fullWidth isLoading={saving} disabled={saving}>
              {t('pages.new_password.save')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
