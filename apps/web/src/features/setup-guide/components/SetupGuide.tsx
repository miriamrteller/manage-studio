import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { managePackagesPath } from '@/features/classes/lib/managePackagesPath';
import { useTenant } from '@/hooks/useTenant';
import { canSkipRow, setupFlavour, type SetupRowId } from '../lib/setupChecklist';
import { legalBlockedKey } from '@/legal/packWording';
import type { SetupGuide as SetupGuideState } from '../hooks/useSetupGuide';

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

export function SetupGuideCard({ guide }: { guide: SetupGuideState }) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const vertical = tenant?.vertical;
  const flavour = setupFlavour(vertical);
  const { rows, skipped, progress } = guide;
  const percent = progress.total === 0 ? 0 : Math.round((progress.resolved / progress.total) * 100);
  const titleId = 'setup-guide-title';

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

      <div className="space-y-1">
        <p className="text-sm font-medium" aria-live="polite">
          {t('setup_guide.progress', { done: progress.resolved, total: progress.total })}
        </p>
        <div
          role="progressbar"
          aria-label={t('setup_guide.progress', { done: progress.resolved, total: progress.total })}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.resolved}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {progress.next && (
        <Link
          to={setupRowHref(progress.next.id, vertical)}
          className="block w-full rounded-[var(--radius-button)] bg-primary px-6 py-3 text-center text-lg font-medium text-on-primary hover:bg-primary-hover active:bg-primary-active outline-offset-2 focus-visible:outline-2"
        >
          {t('setup_guide.next', { step: t(`setup_guide.rows.${rowKey(progress.next.id, flavour)}.title`) })}
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

      <p className="text-sm">
        {t('setup_guide.help')}{' '}
        <a className="underline" href={`mailto:${HELP_EMAIL}`}>
          {HELP_EMAIL}
        </a>
      </p>
    </section>
  );
}
