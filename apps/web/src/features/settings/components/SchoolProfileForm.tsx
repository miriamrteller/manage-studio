import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { Link } from 'react-router-dom';
import { useAuthSession } from '@/hooks/useAuth';
import { useCustomDomainEnabled } from './CustomDomainSettings';
import { LEGAL_FIELDS } from '@/legal/fields';
import { useLegalLang } from '@/legal/useLegalDocument';

/** Legal-page emails that were filled from the studio email (they follow it when it changes). */
export const LEGAL_EMAIL_KEYS = ['email', 'privacy_contact_email', 'accessibility_contact_email'] as const;

/** Which legal emails still hold the old studio email. */
export function legalEmailsCopiedFrom(
  legalProfile: Record<string, unknown> | null | undefined,
  oldEmail: string,
): string[] {
  const old = oldEmail.trim().toLowerCase();
  if (!old) return [];
  return LEGAL_EMAIL_KEYS.filter((k) => {
    const v = legalProfile?.[k];
    return typeof v === 'string' && v.trim().toLowerCase() === old;
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * The legal pages' email to store: empty (follow the business email) when it is blank or equals
 * the business email, otherwise what was typed.
 */
export function legalEmailToStore(typed: string, businessEmail: string): string {
  const v = typed.trim();
  return !v || sameEmail(v, businessEmail) ? '' : v;
}

interface StudioRow {
  contact_email: string | null;
  legal_profile: Record<string, unknown> | null;
}

export function SchoolProfileForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { session } = useAuthSession();
  const loginEmail = session?.user.email ?? '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // "Same as my login email": the typed business email is kept while ticked, so unticking brings it back.
  const [sameAsLogin, setSameAsLogin] = useState(false);
  // Email on your legal pages: follows the business email until the admin types another one.
  const [legalEmail, setLegalEmail] = useState('');
  const [legalTouched, setLegalTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // After the studio email changes: legal emails that still hold the old one (offered, never forced).
  const [legalOffer, setLegalOffer] = useState<{ keys: string[]; from: string; to: string } | null>(null);

  // The studio email (tenants.contact_email): Reply-To on client emails and where enquiry alerts go.
  const studioQuery = useQuery({
    queryKey: ['tenant-studio-email', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<StudioRow | null> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('contact_email, legal_profile')
        .eq('id', tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as StudioRow | null) ?? null;
    },
  });
  const savedEmail = studioQuery.data?.contact_email ?? '';
  const storedLegalEmail = String(studioQuery.data?.legal_profile?.email ?? '').trim();
  const canFollowLogin = !!loginEmail;
  const businessEmail = canFollowLogin && sameAsLogin ? loginEmail : email;
  const shownLegalEmail = legalTouched ? legalEmail : storedLegalEmail && !sameEmail(storedLegalEmail, savedEmail) ? storedLegalEmail : businessEmail;
  const legalField = LEGAL_FIELDS.find((f) => f.key === 'email');
  const lang = useLegalLang();

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name);
  }, [tenant]);
  useEffect(() => {
    // A studio with no business email yet starts from the login email (prefilled, ticked).
    setEmail(savedEmail);
    setSameAsLogin(!!loginEmail && (!savedEmail || sameEmail(savedEmail, loginEmail)));
  }, [savedEmail, loginEmail]);
  useEffect(() => {
    setLegalTouched(false);
  }, [storedLegalEmail, savedEmail]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      const trimmed = name.trim();
      if (!trimmed) throw new Error(t('settings.hub.name_required'));
      const nextEmail = businessEmail.trim();
      if (!EMAIL_RE.test(nextEmail)) throw new Error(t('settings.hub.studio_email_invalid'));
      const nextLegal = legalEmailToStore(shownLegalEmail, nextEmail);
      if (nextLegal && !EMAIL_RE.test(nextLegal)) throw new Error(t('settings.hub.studio_email_invalid'));
      const update: Record<string, unknown> = { name: trimmed, contact_email: nextEmail };
      // The legal pages' email lives here now; only that key of the legal details changes.
      if (nextLegal !== storedLegalEmail) {
        const { data, error: readError } = await supabase.from('tenants').select('legal_profile').eq('id', tenant.id).maybeSingle();
        if (readError) throw readError;
        const legal = { ...(((data as { legal_profile?: Record<string, unknown> } | null)?.legal_profile ?? {}) as Record<string, unknown>) };
        if (nextLegal) legal.email = nextLegal;
        else delete legal.email;
        update.legal_profile = legal;
      }
      // Only the studio's own row: the owner's login email is never touched.
      const { error } = await supabase.from('tenants').update(update).eq('id', tenant.id);
      if (error) throw error;
      const from = savedEmail.trim();
      const changed = !sameEmail(from, nextEmail);
      // The legal pages' own email is handled above; offer the other legal emails that held the old one.
      const keys = legalEmailsCopiedFrom(studioQuery.data?.legal_profile, from).filter((k) => k !== 'email');
      return changed ? { from, to: nextEmail, keys } : null;
    },
    onSuccess: async (change) => {
      setMessage(t('settings.hub.profile_saved'));
      setLegalOffer(change && change.keys.length > 0 ? change : null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-studio-email'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] }),
      ]);
    },
    onError: (err: Error) => {
      setMessage(err.message);
    },
  });

  const updateLegal = useMutation({
    mutationFn: async (offer: { keys: string[]; to: string }) => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      // Read the latest legal details, change only the emails that held the old studio email.
      const { data, error } = await supabase.from('tenants').select('legal_profile').eq('id', tenant.id).maybeSingle();
      if (error) throw error;
      const current = ((data as { legal_profile?: Record<string, unknown> } | null)?.legal_profile ?? {}) as Record<string, unknown>;
      const next = { ...current };
      for (const k of offer.keys) next[k] = offer.to;
      const { error: saveError } = await supabase.from('tenants').update({ legal_profile: next }).eq('id', tenant.id);
      if (saveError) throw saveError;
    },
    onSuccess: async () => {
      setLegalOffer(null);
      setMessage(t('settings.hub.studio_email_legal_updated'));
      await queryClient.invalidateQueries({ queryKey: ['tenant-legal-profile'] });
    },
    onError: () => setMessage(t('settings.hub.studio_email_legal_error')),
  });

  // Read-only: a platform administrator sets tenants.custom_domain (docs/deployment/CUSTOM-DOMAIN.md).
  const customDomainQuery = useQuery({
    queryKey: ['tenant-custom-domain', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data } = await supabase
        .from('tenants')
        .select('custom_domain')
        .eq('id', tenant.id)
        .maybeSingle();
      return (data?.custom_domain as string | null | undefined) ?? null;
    },
    enabled: !!tenant?.id,
  });
  // Studios in the self-serve rollout manage it in CustomDomainSettings instead.
  const selfServe = useCustomDomainEnabled(tenant?.id).data === true;
  const customDomain = selfServe ? null : customDomainQuery.data ?? null;

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('settings.hub.profile_title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.hub.profile_description')}</p>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="school-name">
          {t('settings.hub.school_name')}
        </label>
        <input
          id="school-name"
          type="text"
          className="form-input w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium">{t('settings.hub.business_email')}</legend>
        {canFollowLogin && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sameAsLogin}
              onChange={(e) => setSameAsLogin(e.target.checked)}
              aria-describedby="school-email-hint"
            />
            <span>{t('settings.hub.business_same_as_login', { login: loginEmail })}</span>
          </label>
        )}
        {(!canFollowLogin || !sameAsLogin) && (
          <input
            id="school-email"
            type="email"
            dir="ltr"
            autoComplete="email"
            className="form-input w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={t('settings.hub.business_email')}
            aria-describedby="school-email-hint"
          />
        )}
        <p id="school-email-hint" className="text-xs text-muted-foreground">
          {canFollowLogin && sameAsLogin
            ? t('settings.hub.business_follows_login')
            : loginEmail
              ? t('settings.hub.business_email_hint', { login: loginEmail })
              : t('settings.hub.business_email_hint_no_login')}{' '}
          <Link className="underline" to="/admin/setup/settings?tab=security">
            {t('settings.hub.change_login_link')}
          </Link>
        </p>
      </fieldset>

      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="school-subdomain">
          {t('settings.hub.subdomain')}
        </label>
        <input
          id="school-subdomain"
          type="text"
          className="form-input w-full bg-gray-50"
          value={tenant.subdomain}
          readOnly
          aria-readonly="true"
        />
        <p className="text-xs text-muted-foreground">{t('settings.hub.subdomain_readonly')}</p>
      </div>

      {customDomain && (
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="school-custom-domain">
            {t('settings.hub.custom_domain')}
          </label>
          <input
            id="school-custom-domain"
            type="text"
            dir="ltr"
            className="form-input w-full bg-gray-50"
            value={customDomain}
            readOnly
            aria-readonly="true"
            aria-describedby="school-custom-domain-hint"
          />
          <p id="school-custom-domain-hint" className="text-xs text-muted-foreground">
            {t('settings.hub.custom_domain_readonly')}
          </p>
        </div>
      )}

      <details className="rounded-md border p-4">
        <summary className="cursor-pointer font-medium">{t('settings.hub.filled_for_you')}</summary>
        <div className="mt-3 space-y-1">
          <label className="block text-sm font-medium" htmlFor="school-legal-email">
            {legalField?.label[lang]}
          </label>
          <input
            id="school-legal-email"
            type="email"
            dir="ltr"
            className="form-input w-full"
            value={shownLegalEmail}
            onChange={(e) => {
              setLegalTouched(true);
              setLegalEmail(e.target.value);
            }}
            aria-describedby="school-legal-email-hint"
          />
          {legalField?.hint && (
            <p id="school-legal-email-hint" className="text-xs text-muted-foreground">
              {legalField.hint[lang]}
            </p>
          )}
        </div>
      </details>

      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}

      {legalOffer && (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm" role="note">
          <p>
            {t('settings.hub.studio_email_legal_offer', { count: legalOffer.keys.length, from: legalOffer.from, to: legalOffer.to })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={updateLegal.isPending}
              onClick={() => updateLegal.mutate({ keys: legalOffer.keys, to: legalOffer.to })}
            >
              {t('settings.hub.studio_email_legal_yes')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLegalOffer(null)}>
              {t('settings.hub.studio_email_legal_no')}
            </Button>
          </div>
        </div>
      )}

      <Button
        variant="primary"
        disabled={saveMutation.isPending}
        onClick={() => void saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
