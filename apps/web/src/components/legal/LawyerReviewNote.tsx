import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const STORAGE_PREFIX = 'opalswift:legal-review-dismissed:';

function readDismissed(tenantId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + tenantId);
  } catch {
    return null;
  }
}

function writeDismissed(tenantId: string, version: string) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + tenantId, version);
  } catch {
    // Private mode or storage full: the note simply shows again next time.
  }
}

export interface LawyerReviewNoteProps {
  tenantId: string;
  /** Hash of the published documents; a new version brings the note back. */
  version: string | null;
}

/**
 * Settings → Legal, while the generated pages are published: remind the
 * studio that the documents are drafts and need a lawyer's review. Dismissed
 * per document version, per studio, on this browser; a change to the studio's
 * details or to the templates shows it again.
 */
export function LawyerReviewNote({ tenantId, version }: LawyerReviewNoteProps) {
  const { t } = useTranslation();
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => readDismissed(tenantId));

  useEffect(() => {
    setDismissedVersion(readDismissed(tenantId));
  }, [tenantId]);

  if (!version || dismissedVersion === version) return null;

  const dismiss = () => {
    writeDismissed(tenantId, version);
    setDismissedVersion(version);
  };

  return (
    <Alert variant="warning" role="note" data-testid="lawyer-review-note" className="flex flex-wrap items-start gap-3">
      <p className="text-sm flex-1 min-w-[12rem]">{t('legal.settings.lawyer_note')}</p>
      <Button type="button" variant="secondary" size="sm" onClick={dismiss}>
        {t('legal.settings.lawyer_note_dismiss')}
      </Button>
    </Alert>
  );
}
