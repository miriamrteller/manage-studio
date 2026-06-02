import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AccountSchema, type Account } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FormInput } from '../../../components/ui/form';
import { Button } from '../../../components/ui/button';

interface FamilyFormProps {
  family?: Partial<Account>;
  onSubmit: (data: Partial<Account>) => Promise<void>;
  isLoading?: boolean;
}

/** Edits account metadata only — guardian contact lives on the linked people row. */
export const FamilyForm = ({ family, onSubmit, isLoading }: FamilyFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm({
    resolver: zodResolver(AccountSchema.partial()),
    defaultValues: family || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Account>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(data);
      setSubmitSuccess(true);
      if (!family) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const isCreating = !family?.id;

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 p-4">
      {submitError && (
        <div className="alert-error" role="alert">
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="alert-success" role="status">
          {isCreating ? t('common.success_created') : t('common.success_updated')}
        </div>
      )}

      <FormInput
        htmlFor="name"
        label={t('form.family.name')}
        placeholder={t('form.family.name')}
        error={form.formState.errors.name?.message}
        required
        {...form.register('name')}
      />

      <div className="flex gap-2 pt-4">
        <Button
          type="submit"
          variant="default"
          disabled={isLoading || form.formState.isSubmitting}
        >
          {isCreating ? t('common.create') : t('common.save')}
        </Button>
        <Button
          type="reset"
          variant="secondary"
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
