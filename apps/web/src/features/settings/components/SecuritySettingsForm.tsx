import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SetPasswordDialog } from '@/components/shared/SetPasswordDialog';
import { useAuthSession } from '@/hooks/useAuth';
import { TwoFactorSettings } from '@/components/legal/TwoFactorSettings';
import { DataExportButton } from '@/components/legal/DataExportButton';
import { RequireMfaSetting } from '@/components/legal/RequireMfaSetting';
import { PlatformAccessLog } from '@/components/legal/PlatformAccessLog';

/** Settings → Security: this admin's login password, two-step sign-in, the studio-wide requirement, the data export, and OpalSwift access. */
export function SecuritySettingsForm() {
  const { t } = useTranslation();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const { session } = useAuthSession();
  const loginEmail = session?.user.email ?? '';
  return (
    <section className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('legal.security.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('legal.security.description')}</p>
      </div>
      {loginEmail && (
        <div className="space-y-1">
          <h3 className="font-medium">{t('legal.security.login_email_title')}</h3>
          <p dir="ltr" className="text-sm font-medium text-start">{loginEmail}</p>
          <p className="text-sm text-muted-foreground">{t('legal.security.login_email_hint')}</p>
        </div>
      )}
      <div className="space-y-2">
        <h3 className="font-medium">{t('legal.security.password_title')}</h3>
        <p className="text-sm text-muted-foreground">{t('legal.security.password_description')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>
          {t('legal.security.password_button')}
        </Button>
        <SetPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      </div>
      <TwoFactorSettings />
      <RequireMfaSetting />
      <DataExportButton />
      <PlatformAccessLog />
    </section>
  );
}
