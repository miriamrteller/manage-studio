import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';

const noteSchema = z.string().trim().min(10).max(1000);

export interface AgeReviewRequestFormProps {
  studentName: string;
  className: string;
  studentAge: number | null;
  classAges: string | null;
  onSubmit: (note: string) => Promise<void>;
  onBrowseClasses: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export function AgeReviewRequestForm({
  studentName,
  className,
  studentAge,
  classAges,
  onSubmit,
  onBrowseClasses,
  isSubmitting = false,
  error = null,
}: AgeReviewRequestFormProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const parsed = noteSchema.safeParse(note);
    if (!parsed.success) {
      setValidationError(t('pages.enrolment.age_review_error_note_too_short'));
      return;
    }

    await onSubmit(parsed.data);
  };

  return (
    <form className="mt-3 space-y-3 border-t border-amber-200 pt-3" onSubmit={handleSubmit}>
      <p className="text-sm text-amber-900">
        {studentName} · {className}
        {studentAge != null && classAges ? ` · ${studentAge} / ${classAges}` : null}
      </p>

      <label htmlFor="age-review-note" className="block text-sm font-medium text-amber-900">
        {t('pages.enrolment.age_review_note_label')}
      </label>
      <textarea
        id="age-review-note"
        required
        minLength={10}
        maxLength={1000}
        rows={4}
        className="form-input w-full"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('pages.enrolment.age_review_note_placeholder')}
        disabled={isSubmitting}
      />

      {(validationError || error) && (
        <p className="text-sm text-red-700" role="alert">
          {validationError ?? error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant="secondary" disabled={isSubmitting} className="flex-1">
          {isSubmitting ? t('common.loading') : t('pages.enrolment.age_review_request_button')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onBrowseClasses}
          disabled={isSubmitting}
          className="flex-1"
        >
          {t('pages.enrol_complete.browse_classes')}
        </Button>
      </div>
    </form>
  );
}
