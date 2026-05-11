import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { type Term } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { z } from 'zod';
import { FormInput, FormSelect } from '../../../components/Common';

// Schema source: SPEC.md — Terms table
// Columns: id, tenant_id, name, start_date, end_date, status, created_at
// Notes:
// - System fields (id, tenant_id, created_at) are NOT in form
// - Dates are in ISO format (YYYY-MM-DD)
// - Status: planning, active, completed
// - end_date must be after start_date (validated in server)

// Form schema for creating/editing terms (without system fields)
const TermFormSchema = z.object({
  name: z.string().min(1, 'Term name required').optional(),
  start_date: z.string().date('Invalid date format').optional(),
  end_date: z.string().date('Invalid date format').optional(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
});

interface TermFormProps {
  term?: Partial<Term>;
  onSubmit: (data: Partial<Term>) => Promise<void>;
  isLoading?: boolean;
}

export const TermForm = ({ term, onSubmit, isLoading }: TermFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm({
    resolver: zodResolver(TermFormSchema),
    defaultValues: term || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Term>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(data);
      setSubmitSuccess(true);
      if (!term) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('common.error')
      );
    }
  };

  const isCreating = !term?.id;

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4 p-4"
      dir="rtl"
    >
      {/* Error message */}
      {submitError && (
        <div className="alert-error" role="alert">
          {submitError}
        </div>
      )}

      {/* Success message */}
      {submitSuccess && (
        <div className="alert-success" role="status">
          {isCreating
            ? t('common.success_created')
            : t('common.success_updated')}
        </div>
      )}

      {/* Term Name field — REQUIRED */}
      <FormInput
        htmlFor="name"
        label={t('form.term.name')}
        placeholder={t('form.term.name')}
        error={form.formState.errors.name?.message}
        required
        {...form.register('name')}
      />

      {/* Start Date field — REQUIRED, ISO format */}
      <FormInput
        htmlFor="start_date"
        label={t('form.term.start_date')}
        type="date"
        error={form.formState.errors.start_date?.message}
        required
        {...form.register('start_date')}
      />

      {/* End Date field — REQUIRED, ISO format */}
      <FormInput
        htmlFor="end_date"
        label={t('form.term.end_date')}
        type="date"
        error={form.formState.errors.end_date?.message}
        required
        {...form.register('end_date')}
      />

      {/* Status field — enum dropdown */}
      <FormSelect
        htmlFor="status"
        label={t('form.term.status')}
        error={form.formState.errors.status?.message}
        {...form.register('status')}
      >
        <option value="">-- {t('common.select')} --</option>
        <option value="planning">{t('form.term.status_planning')}</option>
        <option value="active">{t('form.term.status_active')}</option>
        <option value="completed">{t('form.term.status_completed')}</option>
      </FormSelect>

      {/* Form buttons */}
      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isLoading || form.formState.isSubmitting}
          className="button-primary"
        >
          {isLoading || form.formState.isSubmitting
            ? t('common.loading')
            : isCreating
              ? t('common.create')
              : t('common.save')}
        </button>
        <button
          type="reset"
          onClick={() => {
            form.reset();
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
          className="button-outline"
        >
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
};
