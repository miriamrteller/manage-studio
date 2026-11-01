import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

/**
 * "Download all studio data" (Terms §10 / DPA §9 data export): one JSON file
 * with every table the studio owns, secrets excluded. Audited server-side.
 */
export function DataExportButton() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('export_tenant_data');
    setBusy(false);
    if (error || !data) {
      setMessage(error?.message ?? t('common.error'));
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenant?.subdomain ?? 'studio'}-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage(t('legal.security.export_done'));
  };

  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="export-heading">
      <h3 id="export-heading" className="font-medium">
        {t('legal.security.export_title')}
      </h3>
      <p className="text-sm text-muted-foreground">{t('legal.security.export_description')}</p>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void download()}>
        {busy ? t('common.loading') : t('legal.security.export_button')}
      </Button>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
