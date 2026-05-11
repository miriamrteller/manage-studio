import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PersonSchema, type Person } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { PersonFormFields } from './PersonFormFields';
import { PersonFormMessages } from './PersonFormMessages';

// Schema source: SPEC.md Migration 002
// Notes: System fields (id, tenant_id, family_id, user_profile_id) are NOT in form.
//   is_minor is read-only computed field. date_of_birth format: YYYY-MM-DD (ISO date)

interface PersonFormProps {
  person?: Partial<Person>;
  onSubmit: (data: Partial<Person>) => Promise<void>;
  isLoading?: boolean;
}

/**
 * PersonForm: Orchestrates person data form submission
 * - Manages form state and validation using React Hook Form + Zod
 * - Delegates field rendering to PersonFormFields component
 * - Delegates message display to PersonFormMessages component
 * - Composition approach keeps this component under 100 lines per .instructions.md
 */

export const PersonForm = ({ person, onSubmit, isLoading }: PersonFormProps) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const form = useForm({
    resolver: zodResolver(PersonSchema.partial()),
    defaultValues: person || {},
    mode: 'onBlur',
  });

  const handleSubmit = async (data: Partial<Person>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);
      await onSubmit(data);
      setSubmitSuccess(true);
      if (!person) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  const isCreating = !person?.id;

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4 p-4"
      dir="rtl"
    >
      <PersonFormMessages
        submitError={submitError}
        submitSuccess={submitSuccess}
        isCreating={isCreating}
      />

      <PersonFormFields
        register={form.register}
        errors={form.formState.errors}
        person={person}
      />

      {/* Form buttons */}
      <div className="flex gap-2 pt-4">
        <button
          type="submit"
          disabled={isLoading || form.formState.isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
          className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400"
        >
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
};
