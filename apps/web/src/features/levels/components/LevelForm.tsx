import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LevelSchema, type Level } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FormInput } from '../../../components/Common';

// Schema source: SPEC.md — Levels table
// Columns: id, tenant_id, name, sort_order, description (optional), created_at
// Notes:
// - System fields (id, tenant_id, created_at) are NOT in form
// - sort_order is numeric (order for display in dropdowns/lists)

interface LevelFormProps {
  level?: Partial<Level>;
  onSubmit: (data: Partial<Level>) => Promise<void>;
  isLoading?: boolean;
}

export const LevelForm = ({ level, onSubmit, isLoading }: LevelFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm({
    resolver: zodResolver(LevelSchema.partial()),
    defaultValues: level || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Level>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(data);
      setSubmitSuccess(true);
      if (!level) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('common.error')
      );
    }
  };

  const isCreating = !level?.id;

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

      {/* Level Name field — REQUIRED */}
      <FormInput
        htmlFor="name"
        label={t('form.level.name')}
        placeholder={t('form.level.name')}
        error={form.formState.errors.name?.message}
        required
        {...form.register('name')}
      />

      {/* Sort Order field — numeric */}
      <FormInput
        htmlFor="sort_order"
        label={t('form.level.sort_order')}
        type="number"
        min="0"
        error={form.formState.errors.sort_order?.message}
        {...form.register('sort_order', { valueAsNumber: true })}
      />

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
