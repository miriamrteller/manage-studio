import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { Button } from '@/components/ui/button';
import { GoogleCalendarService } from '../googleCalendarService';

export function GoogleCalendarSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { hasFeature } = useFeatureGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = hasFeature(FEATURES.scheduling.googleCalendar);

  const { data } = useQuery({
    queryKey: ['googleCalendarConnection'],
    queryFn: () => GoogleCalendarService.getConnection(),
    enabled,
  });

  if (!enabled) return null;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await GoogleCalendarService.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await GoogleCalendarService.disconnect();
      await queryClient.invalidateQueries({ queryKey: ['googleCalendarConnection'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card border border-gray-200 space-y-3 p-4">
      <h2 className="text-lg font-semibold">{t('scheduling.integrations.google_title')}</h2>
      <p className="text-sm text-gray-600">{t('scheduling.integrations.google_description')}</p>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {data?.connected ? (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-green-700">
            {t('scheduling.integrations.connected_as', { email: data.email ?? '' })}
          </span>
          <Button variant="outline" size="sm" isLoading={busy} onClick={disconnect}>
            {t('scheduling.integrations.disconnect')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-gray-500">{t('scheduling.integrations.not_connected')}</span>
          <Button variant="primary" size="sm" isLoading={busy} onClick={connect}>
            {t('scheduling.integrations.connect')}
          </Button>
        </div>
      )}
    </section>
  );
}
