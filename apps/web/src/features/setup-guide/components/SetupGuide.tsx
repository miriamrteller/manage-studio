import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { managePackagesPath } from '@/features/classes/lib/managePackagesPath';
import { useTenant } from '@/hooks/useTenant';
import { canSkipRow, setupFlavour, type SetupRowId } from '../lib/setupChecklist';
import { legalBlockedKey } from '@/legal/packWording';
import type { SetupGuide as SetupGuideState } from '../hooks/useSetupGuide';
import { funProgress, newlyDone, ROW_MINUTES } from '../lib/setupFun';
import { GemBadge } from './Celebration';

export const HELP_EMAIL = 'hello@opalswift.com';

/** Where each row sends the owner. Existing pages only. */
export function setupRowHref(id: SetupRowId, vertical: string | null | undefined): string {
  switch (id) {
    case 'branding':
      return '/admin/setup/settings?tab=branding';
    case 'levels':
      return '/admin/setup/levels';
    case 'season':
      return '/admin/setup/terms';
    case 'classes':
    case 'packages':
    case 'offerings':
      return managePackagesPath(vertical as Parameters<typeof managePackagesPath>[0]);
    case 'payments':
    case 'connect_payments':
      return '/admin/setup/settings?tab=payment';
    case 'legal':
      return '/admin/setup/settings?tab=legal';
    case 'leads':
      return '/admin/leads';
    case 'test_enrolment':
      return '/classes';
    case 'first_quote':
      return '/admin/quotes';
  }
}

/** Wording differs by studio: health declaration (dance), contract (photographer), form (others). */
function rowKey(id: SetupRowId, flavour: ReturnType<typeof setupFlavour>): string {
  return id === 'legal' ? `legal_${flavour}` : id;
}

const seenKey = (tenantId: string) => `setup-guide-done:${tenantId}`;

function readSeen(tenantId: string | undefined): string[] | null {
  if (!tenantId) return null;
  try {
    const raw = window.localStorage.getItem(seenKey(tenantId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

function writeSeen(tenantId: string | undefined, ids: string[]) {
  if (!tenantId) return;
  try {
    window.localStorage.setItem(seenKey(tenantId), JSON.stringify(ids));
  } catch {
    /* storage blocked: no cheers on this device */
  }
}

/** A short cheer when a row ticks itself (since this device last saw the list). */
function useCheer(tenantId: string | undefined, doneIds: string[], enabled: boolean): [string | null, () => void] {
  const [cheer, setCheer] = useState<string | null>(null);
  const doneKey = doneIds.join(',');
  useEffect(() => {
    if (!tenantId) return;
    const fresh = newlyDone(doneIds, readSeen(tenantId));
    writeSeen(tenantId, doneIds);
    if (enabled && fresh.length > 0) setCheer(fresh[fresh.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doneKey stands for doneIds
  }, [tenantId, doneKey, enabled]);
  return [cheer, () => setCheer(null)];
}

export function SetupGuideCard({
  guide,
  fewer = false,
  onFewerChange,
}: {
  guide: SetupGuideState;
  /** "Fewer celebrations": no cheers. */
  fewer?: boolean;
  onFewerChange?: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const vertical = tenant?.vertical;
  const flavour = setupFlavour(vertical);
  const { rows, skipped, progress } = guide;
  const fun = funProgress(progress);
  const levelName = t(`setup_guide.levels.${fun.level}`);
  const titleId = 'setup-guide-title';
  const fewerId = useId();
  const [cheer, clearCheer] = useCheer(
    tenant?.id,
    rows.filter((r) => r.done).map((r) => r.id),
    !fewer && !guide.isLoading,
  );

  return (
    <section aria-labelledby={titleId} className="card space-y-4 border border-gray-200">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id={titleId} className="text-2xl font-bold text-primary">
            {progress.complete ? t('setup_guide.done_title') : t('setup_guide.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {progress.complete ? t('setup_guide.done_body') : t('setup_guide.intro')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={guide.close}>
          {t('setup_guide.close')}
        </Button>
      </header>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <GemBadge level={fun.levelNumber} />
          <div>
            <p className="text-sm font-semibold">{t('setup_guide.level', { level: levelName })}</p>
            <p className="text-sm" aria-live="polite">
              {t('setup_guide.percent', { percent: fun.percent })}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={t('setup_guide.progress_label')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fun.percent}
          aria-valuetext={`${t('setup_guide.percent', { percent: fun.percent })} ${t('setup_guide.level', { level: levelName })}`}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${fun.percent}%` }} />
        </div>
      </div>

      {cheer && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p role="status" aria-live="polite">
            <span aria-hidden="true">✨ </span>
            {t(`setup_guide.cheers.${cheer}`)}
          </p>
          <Button variant="ghost" size="sm" onClick={clearCheer}>
            {t('setup_guide.celebrate.dismiss')}
          </Button>
        </div>
      )}

      {progress.complete && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 p-3">
          <p className="font-medium">{t('setup_guide.live')}</p>
          <Link
            to="/admin/leads/get"
            className="inline-flex items-center rounded-[var(--radius-button)] bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover outline-offset-2 focus-visible:outline-2"
          >
            {t('setup_guide.celebrate.share_link')}
          </Link>
        </div>
      )}

      {progress.next && (
        <Link
          to={setupRowHref(progress.next.id, vertical)}
          className="block w-full rounded-[var(--radius-button)] bg-primary px-6 py-3 text-center text-lg font-medium text-on-primary hover:bg-primary-hover active:bg-primary-active outline-offset-2 focus-visible:outline-2"
        >
          {t('setup_guide.next', { step: t(`setup_guide.rows.${rowKey(progress.next.id, flavour)}.title`) })}
          <span className="block text-sm font-normal">
            {t('setup_guide.minutes', { count: ROW_MINUTES[progress.next.id] })}
            {fun.remaining <= 2 && ` · ${t('setup_guide.to_go', { count: fun.remaining })}`}
          </span>
        </Link>
      )}

      <ul className="divide-y divide-border">
        {rows.map((row) => {
          const key = rowKey(row.id, flavour);
          const skippable = canSkipRow(row.id);
          const isSkipped = !row.done && skippable && skipped.includes(row.id);
          const status = row.done ? t('setup_guide.status_done') : isSkipped ? t('setup_guide.status_skipped') : t('setup_guide.status_todo');
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm',
                  row.done ? 'border-primary bg-primary text-on-primary' : 'border-border',
                )}
              >
                {row.done ? '✓' : ''}
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <Link to={setupRowHref(row.id, vertical)} className="font-medium underline-offset-2 hover:underline">
                  {t(`setup_guide.rows.${key}.title`)}
                  <span className="sr-only"> — {status}</span>
                </Link>
                <p className="text-sm text-muted-foreground">{t(`setup_guide.rows.${key}.hint`)}</p>
                {row.id === 'legal' && !row.done && (
                  <p className="text-sm font-medium text-amber-800">{t(legalBlockedKey(vertical))}</p>
                )}
              </div>
              {!row.done &&
                skippable &&
                (isSkipped ? (
                  <Button variant="outline" size="sm" onClick={() => guide.unskip(row.id)}>
                    {t('setup_guide.undo_skip')}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => guide.skip(row.id)}>
                    {t('setup_guide.skip')}
                  </Button>
                ))}
            </li>
          );
        })}
      </ul>

      {onFewerChange && (
        <label htmlFor={fewerId} className="flex items-center gap-2 text-sm">
          <input id={fewerId} type="checkbox" checked={fewer} onChange={(e) => onFewerChange(e.target.checked)} />
          <span>{t('setup_guide.fewer')}</span>
        </label>
      )}

      <p className="text-sm">
        {t('setup_guide.help')}{' '}
        <a className="underline" href={`mailto:${HELP_EMAIL}`}>
          {HELP_EMAIL}
        </a>
      </p>
    </section>
  );
}
