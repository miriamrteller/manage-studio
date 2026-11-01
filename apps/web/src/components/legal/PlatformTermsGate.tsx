import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasAcceptedPlatformTerms, platformTermsVersion, recordLegalAcceptance } from '@/legal/acceptance';
import { useLegalLang } from '@/legal/useLegalDocument';

/**
 * Before a studio admin uses the admin area, someone at the studio must have
 * accepted the current OpalSwift Terms of Service and DPA. Covers studios set
 * up by hand (no signup form). Fails open on errors so a backend hiccup never
 * locks admins out; the acceptance is recorded the next time it loads.
 */
export function PlatformTermsGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const lang = useLegalLang();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);

  const isSuperAdmin = !!user?.role?.includes('super_admin');
  const enabled = !!tenant?.id && !!user && !isSuperAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ['platform-terms-acceptance', tenant?.id],
    enabled,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const version = await platformTermsVersion();
      try {
        return { version, accepted: await hasAcceptedPlatformTerms(tenant!.id, version) };
      } catch (err) {
        console.warn('[PlatformTermsGate] acceptance check failed; not blocking', err);
        return { version, accepted: true };
      }
    },
  });

  const accept = useMutation({
    mutationFn: async () => {
      if (!tenant?.id || !data) throw new Error('not ready');
      await recordLegalAcceptance({
        tenantId: tenant.id,
        documents: ['platform_terms', 'dpa', 'opalswift_privacy'],
        version: data.version,
        language: lang,
        role: 'tenant_admin',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-terms-acceptance', tenant?.id] });
    },
  });

  if (!enabled || isLoading || !data || data.accepted) return <>{children}</>;

  return (
    <section className="max-w-xl mx-auto my-10 rounded-lg border p-6 space-y-4" aria-labelledby="platform-terms-title">
      <h1 id="platform-terms-title" className="text-xl font-semibold">
        {t('legal.platform_gate.title')}
      </h1>
      <p className="text-sm">{t('legal.platform_gate.body')}</p>
      <ul className="list-disc ps-6 text-sm space-y-1">
        <li>
          <Link to="/legal/platform-terms" target="_blank" rel="noopener noreferrer" className="underline">
            {t('legal.docs.platform_terms')}
          </Link>
        </li>
        <li>
          <Link to="/legal/dpa" target="_blank" rel="noopener noreferrer" className="underline">
            {t('legal.docs.dpa')}
          </Link>
        </li>
        <li>
          <Link to="/legal/opalswift-privacy" target="_blank" rel="noopener noreferrer" className="underline">
            {t('legal.docs.opalswift_privacy')}
          </Link>
        </li>
      </ul>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>{t('legal.platform_gate.checkbox')}</span>
      </label>
      {accept.isError && (
        <p className="text-sm text-destructive" role="alert">
          {t('legal.platform_gate.error')}
        </p>
      )}
      <Button variant="primary" disabled={!checked || accept.isPending} onClick={() => accept.mutate()}>
        {t('legal.platform_gate.accept')}
      </Button>
    </section>
  );
}
