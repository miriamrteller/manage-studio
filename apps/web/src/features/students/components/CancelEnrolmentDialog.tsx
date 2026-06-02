import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCancelEnrolment } from '@/features/enrolment/hooks/useCancelEnrolment';
import { mapCancelEnrolmentError } from '@/features/enrolment/lib/enrolmentTransitions';

interface CancelEnrolmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  personId: string;
  studentName: string;
  className: string;
}

export function CancelEnrolmentDialog({
  open,
  onOpenChange,
  engagementId,
  personId,
  studentName,
  className,
}: CancelEnrolmentDialogProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [errorKey, setErrorKey] = useState<'has_payment' | 'invalid_status' | 'generic' | null>(
    null,
  );

  const cancelMutation = useCancelEnrolment({
    personId,
    onSuccess: () => {
      setReason('');
      setErrorKey(null);
      onOpenChange(false);
    },
  });

  const handleClose = () => {
    if (cancelMutation.isPending) return;
    setErrorKey(null);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    setErrorKey(null);
    cancelMutation.mutate(
      {
        engagementId,
        reason: reason.trim() || undefined,
      },
      {
        onError: (err) => {
          const code = mapCancelEnrolmentError(
            err instanceof Error ? err.message : String(err),
          );
          setErrorKey(code);
        },
      },
    );
  };

  const errorMessage =
    errorKey === 'has_payment'
      ? t('pages.students.cancel_enrolment_error_has_payment')
      : errorKey === 'invalid_status'
        ? t('pages.students.cancel_enrolment_error_invalid_status')
        : errorKey === 'generic'
          ? t('common.error')
          : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pages.students.cancel_enrolment_title')}</DialogTitle>
          <DialogDescription>
            {t('pages.students.cancel_enrolment_confirm', { studentName, className })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label htmlFor="cancel-enrolment-reason" className="block text-sm font-medium">
            {t('pages.students.cancel_enrolment_reason_label')}
          </label>
          <textarea
            id="cancel-enrolment-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            placeholder={t('pages.students.cancel_enrolment_reason_placeholder')}
            rows={3}
            className="form-input w-full"
            disabled={cancelMutation.isPending}
          />

          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={cancelMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              isLoading={cancelMutation.isPending}
              aria-describedby="cancel-enrolment-reason"
            >
              {t('pages.students.cancel_enrolment_button')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
