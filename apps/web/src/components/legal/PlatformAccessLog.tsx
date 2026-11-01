import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';

const LIMIT = 200;

type Row = { id: string; at: string; kind: 'view' | 'change'; area: string };

/**
 * Settings → Security → "OpalSwift access": when the OpalSwift platform owner
 * opened or changed this studio's data (platform_access_log). Read-only; RLS
 * shows a studio's admins their own studio's rows only.
 */
export function PlatformAccessLog() {
  const { t, i18n } = useTranslation();
  const tenant = useTenant();

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform-access-log', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_access_log')
        .select('id, at, kind, area')
        .eq('tenant_id', tenant!.id)
        .order('at', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (!tenant) return null;
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <section className="space-y-2 rounded-md border p-4" aria-labelledby="platform-access-heading">
      <h3 id="platform-access-heading" className="font-medium">
        {t('legal.security.access_heading')}
      </h3>
      <p className="text-xs text-muted-foreground">{t('legal.security.access_help')}</p>
      {isLoading && <p className="text-sm">{t('common.loading')}</p>}
      {error && (
        <p className="text-sm" role="alert">
          {t('common.error')}
        </p>
      )}
      {data && data.length === 0 && (
        <p className="text-sm" data-testid="platform-access-empty">
          {t('legal.security.access_empty')}
        </p>
      )}
      {data && data.length > 0 && (
        <table className="w-full text-sm" data-testid="platform-access-log">
          <thead>
            <tr className="text-start text-muted-foreground">
              <th className="py-1 text-start font-normal">{t('legal.security.access_col_date')}</th>
              <th className="py-1 text-start font-normal">{t('legal.security.access_col_kind')}</th>
              <th className="py-1 text-start font-normal">{t('legal.security.access_col_area')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="py-1">{dateFormat.format(new Date(row.at))}</td>
                <td className="py-1">
                  {row.kind === 'change' ? t('legal.security.access_kind_change') : t('legal.security.access_kind_view')}
                </td>
                <td className="py-1">
                  {t(`legal.security.access_area.${row.area}`, { defaultValue: row.area })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
