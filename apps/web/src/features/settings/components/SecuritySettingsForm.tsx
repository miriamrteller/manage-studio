import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SetPasswordDialog } from '@/components/shared/SetPasswordDialog';
import { ChangeLoginEmail } from '@/components/shared/ChangeLoginEmail';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import { TwoFactorSettings } from '@/components/legal/TwoFactorSettings';
import { DataExportButton } from '@/components/legal/DataExportButton';
import { RequireMfaSetting } from '@/components/legal/RequireMfaSetting';
import { PlatformAccessLog } from '@/components/legal/PlatformAccessLog';

/** Settings → Security: this admin's login password, two-step sign-in, the studio-wide requirement, the data export, and OpalSwift access. */
export function SecuritySettingsForm() {
  const { t } = useTranslation();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const tenant = useTenant();
  // The business email, so "Also use this as my business email" starts ticked when it equals the login.
  const { data: businessEmail } = useQuery({
    queryKey: ['tenant-studio-email', tenant?.id, 'business-email'],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('contact_email').eq('id', tenant!.id).maybeSingle();
      return ((data as { contact_email?: string | null } | null)?.contact_email ?? null) as string | null;
    },
  });
  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('legal.security.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('legal.security.description')}</p>
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">{t('legal.security.password_title')}</h3>
        <p className="text-sm text-muted-foreground">{t('legal.security.password_description')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>
          {t('legal.security.password_button')}
        </Button>
        <SetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      </div>
      <ChangeLoginEmail businessEmail={businessEmail ?? null} />
      <TwoFactorSettings />
      <RequireMfaSetting />
      <DataExportButton />
      <PlatformAccessLog />
    </section>
  );
}
