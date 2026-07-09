import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { ScheduleCalendar } from '@/features/scheduling/components/ScheduleCalendar';
import { ScheduleService } from '@/features/scheduling/service';
import type { ScheduleEvent } from '@/features/scheduling/types';

export default function AdminCalendarPage() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const { hasFeature, isLoading: gateLoading } = useFeatureGate();
  const [selected, setSelected] = useState<ScheduleEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canView = hasFeature(FEATURES.scheduling.calendarView);

  async function handleCreateBlock(range: { start: Date; end: Date }) {
    if (!tenant?.id) return;
    const summary = window.prompt(t('scheduling.calendar.block_prompt'), t('scheduling.calendar.block_default'));
    if (summary === null) return;
    try {
      setError(null);
      await ScheduleService.createBlock(tenant as never, {
        summary: summary.trim() || t('scheduling.calendar.block_default'),
        start_time: range.start.toISOString(),
        end_time: range.end.toISOString(),
      });
      await queryClient.invalidateQueries({ queryKey: ['scheduleEvents'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteBlock(event: ScheduleEvent) {
    if (!tenant?.id || !event.ref_id) return;
    if (!window.confirm(t('scheduling.calendar.block_delete_confirm'))) return;
    try {
      setError(null);
      await ScheduleService.deleteBlock(tenant as never, event.ref_id);
      await queryClient.invalidateQueries({ queryKey: ['scheduleEvents'] });
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!gateLoading && !canView) {
    return (
      <div className="max-w-3xl space-y-2 p-2">
        <h1 className="text-3xl font-bold">{t('scheduling.calendar.title')}</h1>
        <p className="text-gray-600">{t('scheduling.calendar.not_available')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('scheduling.calendar.title')}</h1>
        <p className="text-gray-600">{t('scheduling.calendar.subtitle')}</p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="card border border-gray-200 p-4">
        <ScheduleCalendar onCreateBlock={handleCreateBlock} onEventClick={setSelected} />
      </div>

      {selected && (
        <aside className="card border border-gray-200 space-y-3 p-4" aria-label={t('scheduling.calendar.detail_title')}>
          <div className="flex items-start justify-between">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <button
              type="button"
              className="text-sm text-gray-500 hover:text-gray-800"
              onClick={() => setSelected(null)}
            >
              {t('common.close')}
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">{t('scheduling.calendar.field_type')}</dt>
            <dd>{t(`scheduling.event_type.${selected.event_type}`)}</dd>
            <dt className="text-gray-500">{t('scheduling.calendar.field_start')}</dt>
            <dd>{new Date(selected.starts_at).toLocaleString()}</dd>
            <dt className="text-gray-500">{t('scheduling.calendar.field_end')}</dt>
            <dd>{new Date(selected.ends_at).toLocaleString()}</dd>
          </dl>
          {selected.event_type === 'blocked' && (
            <button
              type="button"
              className="text-sm text-red-600 hover:text-red-800"
              onClick={() => handleDeleteBlock(selected)}
            >
              {t('scheduling.calendar.block_delete')}
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
