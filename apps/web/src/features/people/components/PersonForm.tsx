import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PersonSchema, type Person } from '@shared/schemas';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PersonFormFields } from './PersonFormFields';
import { PersonFormMessages } from './PersonFormMessages';
import { ConsentFields } from './ConsentFields';
import { calculateAge } from '@/lib/utils';

// Schema source: SPEC.md Migration 002
// Notes: System fields (id, tenant_id, account_id, user_profile_id) are NOT in form.
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
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  const form = useForm({
    resolver: zodResolver(PersonSchema.partial()),
    defaultValues: person || {},
    mode: 'onBlur',
  });

  const isCreating = !person?.id;

  const handleSubmit = async (data: Partial<Person>) => {
    try {
      setSubmitError(null);
      setSubmitSuccess(false);

      // Check if creating a minor without waiver
      if (isCreating && data.date_of_birth) {
        const age = calculateAge(data.date_of_birth);
        if (age !== null && age < 18 && !waiverAccepted) {
          setShowWaiverModal(true);
          return;
        }
      }

      await onSubmit(data);
      setSubmitSuccess(true);
      if (!person) {
        form.reset();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t('common.error'));
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="space-y-4 p-4"
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

      {/* Consent Fields */}
      <ConsentFields register={form.register} />

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

      {/* Waiver Modal for Minors */}
      {showWaiverModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-semibold">
              {t('pages.people.waiver_required')}
            </h2>
            <p className="text-gray-700">
              {t('pages.people.waiver_agreement_text')}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setWaiverAccepted(true);
                  form.handleSubmit(handleSubmit)();
                  setShowWaiverModal(false);
                }}
              >
                {t('common.accept')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowWaiverModal(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
