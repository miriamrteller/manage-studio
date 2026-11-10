import { Suspense, lazy, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug, LifeBuoy, Lightbulb, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { SCREENSHOT_TYPES, checkScreenshot } from '@/lib/monitoring';
import { FEEDBACK_KINDS, sendFeedback, type FeedbackKind } from '@/lib/monitoring/sendFeedback';

// Loaded only when the admin opens "Hide details", so it adds nothing to the normal app load.
const ScreenshotRedactor = lazy(() => import('./ScreenshotRedactor').then((m) => ({ default: m.ScreenshotRedactor })));

type Status = 'idle' | 'sending' | 'sent' | 'failed';

const KIND_ICONS: Record<FeedbackKind, LucideIcon> = { bug: Bug, idea: Lightbulb, help: LifeBuoy };

/**
 * "Send feedback": the admin taps Bug, Idea or Help (all three visible at once), then
 * writes a message. The page, the studio and its industry are filled in for them.
 */
export function ReportProblemDialog({
  isOpen,
  onClose,
  tenantId,
  initialKind = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  initialKind?: FeedbackKind | null;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const descriptionId = `${ids}-description`;
  const fieldId = `${ids}-message`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const fileId = `${ids}-screenshot`;
  const fileWarningId = `${ids}-screenshot-warning`;
  const fileErrorId = `${ids}-screenshot-error`;
  const snapshotHintId = `${ids}-snapshot-hint`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const redactButtonRef = useRef<HTMLButtonElement>(null);
  const kindGroupId = `${ids}-kind`;
  const [kind, setKind] = useState<FeedbackKind | null>(initialKind);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [showRequired, setShowRequired] = useState(false);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setKind(initialKind);
      setMessage('');
      setStatus('idle');
      setShowRequired(false);
      setScreenshot(null);
      setScreenshotError(null);
      setEditing(false);
      setSnapshotBusy(false);
    }
  }, [isOpen, initialKind]);

  const onPickScreenshot = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const problem = await checkScreenshot(file);
    if (problem) {
      input.value = '';
      setScreenshot(null);
      setScreenshotError(t(`report_problem.screenshot_error_${problem}`));
      return;
    }
    setScreenshotError(null);
    setScreenshot(file);
  };

  // Optional: a picture of the page behind this window with all text, form values and images
  // replaced by solid blocks, built from the page itself (see lib/monitoring/pageSnapshot.ts).
  const takeSnapshot = async () => {
    setSnapshotBusy(true);
    setScreenshotError(null);
    try {
      const { capturePageSnapshot } = await import('@/lib/monitoring/pageSnapshot');
      const file = await capturePageSnapshot();
      const problem = await checkScreenshot(file);
      if (problem) {
        setScreenshotError(t(`report_problem.screenshot_error_${problem}`));
        return;
      }
      setScreenshot(file);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setScreenshotError(
        t(code === 'too_large' ? 'report_problem.snapshot_error_too_large' : 'report_problem.snapshot_error_failed'),
      );
    } finally {
      setSnapshotBusy(false);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setScreenshotError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.focus();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!kind) return;
    if (!message.trim()) {
      setShowRequired(true);
      return;
    }
    setStatus('sending');
    const ok = await sendFeedback({ kind, message, screenshot, tenantId });
    setStatus(ok ? 'sent' : 'failed');
  };

  const fieldError = showRequired && !message.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('report_problem.title')} describedById={descriptionId}>
      <p id={descriptionId} className="mb-4 text-sm text-muted-foreground">
        {t('report_problem.description')}
      </p>

      <div aria-live="polite" role="status">
        {status === 'sent' && kind && (
          <p className="mb-4 font-medium text-foreground">{t(`report_problem.kinds.${kind}.sent`)}</p>
        )}
        {status === 'failed' && <p className="mb-4 font-medium text-red-700">{t('report_problem.failed')}</p>}
      </div>

      {editing && screenshot ? (
        <Suspense fallback={<p className="text-sm">{t('common.loading')}</p>}>
          <ScreenshotRedactor
            file={screenshot}
            onDone={(file) => {
              setScreenshot(file);
              setEditing(false);
              setTimeout(() => redactButtonRef.current?.focus(), 0);
            }}
            onCancel={() => {
              setEditing(false);
              setTimeout(() => redactButtonRef.current?.focus(), 0);
            }}
          />
        </Suspense>
      ) : status === 'sent' ? (
        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <fieldset aria-labelledby={kindGroupId}>
            <legend id={kindGroupId} className="mb-2 text-sm font-medium">
              {t('report_problem.kind_label')}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {FEEDBACK_KINDS.map((k) => {
                const Icon = KIND_ICONS[k];
                const checked = kind === k;
                return (
                  <label
                    key={k}
                    className={`flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 px-2 py-3 text-center text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                      checked ? 'border-primary bg-muted ring-1 ring-primary' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name={kindGroupId}
                      value={k}
                      checked={checked}
                      onChange={() => {
                        setKind(k);
                        setShowRequired(false);
                      }}
                      className="sr-only"
                    />
                    <Icon size={24} aria-hidden />
                    {t(`report_problem.kinds.${k}.button`)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {kind && (
            <>
              <p className="text-sm text-muted-foreground">{t(`report_problem.kinds.${kind}.description`)}</p>
              <Label htmlFor={fieldId} required>
                {t(`report_problem.kinds.${kind}.label`)}
              </Label>
              <Textarea
                id={fieldId}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={2000}
                dir="auto"
                placeholder={t(`report_problem.kinds.${kind}.placeholder`)}
                aria-required="true"
                aria-invalid={fieldError || undefined}
                aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
              />
              <p id={hintId} className="text-sm text-muted-foreground">
                {t('report_problem.privacy_hint')}
              </p>
              <p id={errorId} aria-live="polite" className="text-sm text-red-700">
                {fieldError ? t(`report_problem.kinds.${kind}.required`) : ''}
              </p>

              {/* Optional screenshot, chosen by the admin. Nothing is captured automatically. */}
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  id={fileId}
                  type="file"
                  accept={SCREENSHOT_TYPES.join(',')}
                  className="peer sr-only"
                  aria-describedby={screenshotError ? `${fileWarningId} ${fileErrorId}` : fileWarningId}
                  aria-invalid={screenshotError ? true : undefined}
                  onChange={onPickScreenshot}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor={fileId}
                    className="inline-flex cursor-pointer items-center rounded-md border px-3 py-1 text-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                  >
                    {t('report_problem.screenshot_button')}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={takeSnapshot}
                    isLoading={snapshotBusy}
                    disabled={snapshotBusy}
                    aria-describedby={snapshotHintId}
                  >
                    {snapshotBusy ? t('report_problem.snapshot_busy') : t('report_problem.snapshot_button')}
                  </Button>
                  {screenshot && (
                    <>
                      <Button
                        ref={redactButtonRef}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(true)}
                      >
                        {t('report_problem.redact_button')}
                      </Button>
                      <span className="text-sm" dir="auto">
                        {t('report_problem.screenshot_chosen', { name: screenshot.name })}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeScreenshot}
                        aria-label={t('report_problem.screenshot_remove_named', { name: screenshot.name })}
                      >
                        {t('report_problem.screenshot_remove')}
                      </Button>
                    </>
                  )}
                </div>
                <p id={fileWarningId} className="text-sm text-muted-foreground">
                  {t('report_problem.screenshot_warning')}
                </p>
                <p id={snapshotHintId} className="text-sm text-muted-foreground">
                  {t('report_problem.snapshot_hint')}
                </p>
                <p id={fileErrorId} role="alert" className="text-sm text-red-700">
                  {screenshotError ?? ''}
                </p>
              </div>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={status === 'sending'}
              disabled={status === 'sending' || !kind}
            >
              {status === 'sending' ? t('report_problem.sending') : t('report_problem.submit')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
