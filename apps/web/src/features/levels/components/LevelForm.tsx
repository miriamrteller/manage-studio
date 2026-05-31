import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CategorySchema, type Category } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormInput } from '../../../components/ui/form';

// Schema source: SPEC.md — Levels table
// Columns: id, tenant_id, name, sort_order, description (optional), created_at
// Notes:
// - System fields (id, tenant_id, created_at) are NOT in form
// - sort_order is numeric (order for display in dropdowns/lists)

interface LevelFormProps {
  level?: Partial<Category>;
  onSubmit: (data: Partial<Category>) => Promise<void>;
  isLoading?: boolean;
}

export const LevelForm = ({ level, onSubmit, isLoading }: LevelFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm({
    resolver: zodResolver(CategorySchema.partial()),
    defaultValues: level || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Category>) => {
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
        <Button
          type="submit"
          variant="primary"
          disabled={isLoading || form.formState.isSubmitting}
          isLoading={isLoading || form.formState.isSubmitting}
        >
          {isCreating ? t('common.create') : t('common.save')}
        </Button>
        <Button
          type="reset"
          variant="outline"
          onClick={() => {
            form.reset();
            setSubmitError(null);
            setSubmitSuccess(false);
          }}
        >
          {t('form.cancel')}
        </Button>
      </div>
    </form>
  );
};
