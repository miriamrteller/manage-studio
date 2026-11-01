import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { sendProblemReport } from '@/lib/monitoring';

type Status = 'idle' | 'sending' | 'sent' | 'failed';

export function ReportProblemDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ids = useId();
  const descriptionId = `${ids}-description`;
  const fieldId = `${ids}-message`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [showRequired, setShowRequired] = useState(false);

  // Fresh form every time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setStatus('idle');
      setShowRequired(false);
    }
  }, [isOpen]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setShowRequired(true);
      return;
    }
    setStatus('sending');
    const id = await sendProblemReport(message);
    setStatus(id ? 'sent' : 'failed');
  };

  const fieldError = showRequired && !message.trim();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('report_problem.title')} describedById={descriptionId}>
      <p id={descriptionId} className="mb-4 text-sm text-muted-foreground">
        {t('report_problem.description')}
      </p>

      <div aria-live="polite" role="status">
        {status === 'sent' && <p className="mb-4 font-medium text-foreground">{t('report_problem.sent')}</p>}
        {status === 'failed' && <p className="mb-4 font-medium text-red-700">{t('report_problem.failed')}</p>}
      </div>

      {status === 'sent' ? (
        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <Label htmlFor={fieldId} required>
            {t('report_problem.label')}
          </Label>
          <Textarea
            id={fieldId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            maxLength={2000}
            dir="auto"
            placeholder={t('report_problem.placeholder')}
            aria-required="true"
            aria-invalid={fieldError || undefined}
            aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            {t('report_problem.privacy_hint')}
          </p>
          <p id={errorId} aria-live="polite" className="text-sm text-red-700">
            {fieldError ? t('report_problem.required') : ''}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" isLoading={status === 'sending'} disabled={status === 'sending'}>
              {status === 'sending' ? t('report_problem.sending') : t('report_problem.submit')}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
