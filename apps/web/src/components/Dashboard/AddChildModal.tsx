import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EnrolmentOnboardingService } from '@/features/enrolment/onboardingService';

interface AddChildModalProps {
  onClose: () => void;
}

export function AddChildModal({ onClose }: AddChildModalProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!tenant || !user?.id) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const accountId = await EnrolmentOnboardingService.getParentAccountId(user.id);
      await EnrolmentOnboardingService.createChildForAccount(tenant, accountId, {
        student_name: name,
        student_date_of_birth: dateOfBirth,
      });
      await queryClient.invalidateQueries({
        queryKey: ['parent-portal', tenant.id, user.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ['account-students', tenant.id, user.id],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-child-title"
        className="w-full max-w-md rounded-lg bg-white shadow-lg"
      >
        <div className="flex items-center justify-between border-b p-4">
          <h2 id="add-child-title" className="text-xl font-semibold">
            {t('pages.portal.add_child_title')}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label={t('common.close')}
          >
            ✕
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <p className="text-sm text-gray-600">{t('pages.portal.add_child_desc')}</p>
          <fieldset className="space-y-3">
            <legend className="sr-only">{t('pages.enrolment.student_section')}</legend>
            <input
              type="text"
              required
              className="form-input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('form.person.name')}
            />
            <input
              type="date"
              required
              className="form-input w-full"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </fieldset>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? t('common.loading') : t('pages.portal.add_child_submit')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
