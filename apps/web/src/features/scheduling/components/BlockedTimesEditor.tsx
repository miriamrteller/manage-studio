import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tenant } from '@shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScheduleService } from '@/features/scheduling/service';
import { blockRange, formatBlock, todayInJerusalem, type BlockDraft } from '@/features/scheduling/lib/blockTimes';

/**
 * "Times you can't do": the owner takes times off her bookable hours.
 * Each block is saved straight away (no page Save), and get_available_slots /
 * create_scheduling_hold already skip blocks.
 */
export function BlockedTimesEditor({ tenant }: { tenant: Tenant }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const locale = i18n.language === 'en' ? 'en-GB' : 'he-IL';
  const today = todayInJerusalem();
  const emptyDraft: BlockDraft = { fromDate: today, toDate: today, allDay: true, fromTime: '09:00', toTime: '12:00' };
  const [draft, setDraft] = useState<BlockDraft>(emptyDraft);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const key = ['schedulingBlocks', tenant.id];
  const blocksQuery = useQuery({ queryKey: key, queryFn: () => ScheduleService.listUpcomingBlocks(tenant) });

  const add = useMutation({
    mutationFn: (range: { start_time: string; end_time: string }) =>
      ScheduleService.createBlock(tenant, {
        ...range,
        summary: note.trim() || t('scheduling.booking.blocks_default_summary'),
      }),
    onSuccess: async () => {
      setDraft(emptyDraft);
      setNote('');
      await qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => ScheduleService.deleteBlock(tenant, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  });

  function patch(p: Partial<BlockDraft>) {
    setError(null);
    setDraft((prev) => {
      const next = { ...prev, ...p };
      // Moving the start date past the end date moves the end date with it.
      if (p.fromDate && (!prev.toDate || prev.toDate < p.fromDate)) next.toDate = p.fromDate;
      return next;
    });
  }

  function handleAdd() {
    const range = blockRange(draft);
    if (!range) {
      setError(t('scheduling.booking.blocks_invalid'));
      return;
    }
    add.mutate(range);
  }

  const blocks = blocksQuery.data ?? [];

  return (
    <section className="card space-y-4 border border-gray-200 p-4" data-testid="blocked-times">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t('scheduling.booking.blocks_title')}</h2>
        <p className="text-sm text-gray-500">{t('scheduling.booking.blocks_hint')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('scheduling.booking.blocks_from_date')}>
          <Input type="date" min={today} value={draft.fromDate} onChange={(e) => patch({ fromDate: e.target.value })} />
        </Field>
        <Field label={t('scheduling.booking.blocks_to_date')}>
          <Input type="date" min={draft.fromDate || today} value={draft.toDate} onChange={(e) => patch({ toDate: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 pb-2">
          <Checkbox checked={draft.allDay} onCheckedChange={(c) => patch({ allDay: c })} />
          <span className="text-sm">{t('scheduling.booking.blocks_all_day')}</span>
        </label>
        {!draft.allDay && (
          <>
            <Field label={t('scheduling.booking.blocks_from_time')}>
              <Input type="time" value={draft.fromTime} onChange={(e) => patch({ fromTime: e.target.value })} />
            </Field>
            <Field label={t('scheduling.booking.blocks_to_time')}>
              <Input type="time" value={draft.toTime} onChange={(e) => patch({ toTime: e.target.value })} />
            </Field>
          </>
        )}
        <Field label={t('scheduling.booking.blocks_note')}>
          <Input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button variant="outline" size="sm" isLoading={add.isPending} onClick={handleAdd}>
          {t('scheduling.booking.blocks_add')}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {blocksQuery.isSuccess && blocks.length === 0 && (
        <p className="text-sm text-gray-500">{t('scheduling.booking.blocks_none')}</p>
      )}
      {blocks.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                <span className="font-medium">{formatBlock(b.start_time, b.end_time, locale)}</span>
                {b.summary && <span className="text-gray-500"> · {b.summary}</span>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                isLoading={remove.isPending && remove.variables === b.id}
                onClick={() => remove.mutate(b.id)}
              >
                {t('common.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
