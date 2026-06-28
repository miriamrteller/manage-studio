import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EnrolmentOnboardingService } from '../onboardingService';

interface GuardianProfileSetupPanelProps {
  mode: 'create' | 'update_dob';
  personId?: string;
  defaultName?: string;
  defaultDateOfBirth?: string;
  accountId: string;
  accountMemberId: string;
  onComplete: (personId: string, dateOfBirth: string) => void;
  onCancel?: () => void;
}

export function GuardianProfileSetupPanel({
  mode,
  personId,
  defaultName = '',
  defaultDateOfBirth = '',
  accountId,
  accountMemberId,
  onComplete,
  onCancel,
}: GuardianProfileSetupPanelProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();

  const [name, setName] = useState(defaultName);
  const [dateOfBirth, setDateOfBirth] = useState(defaultDateOfBirth);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!tenant || !user?.id) return;

    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        const profile = await EnrolmentOnboardingService.ensureGuardianPersonForParent(tenant, {
          userProfileId: user.id,
          userEmail: user.email,
          accountId,
          accountMemberId,
          name,
          dateOfBirth,
          phone: phone.trim() || null,
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['enrolment-guardian', tenant.id, user.id] }),
          queryClient.invalidateQueries({ queryKey: ['account-students', tenant.id, user.id] }),
          queryClient.invalidateQueries({ queryKey: ['parent-portal', tenant.id, user.id] }),
        ]);
        onComplete(profile.personId, dateOfBirth);
        return;
      }

      if (!personId) {
        throw new Error(t('common.error'));
      }

      const person = await EnrolmentOnboardingService.updateGuardianDateOfBirth(
        tenant,
        personId,
        dateOfBirth,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['enrolment-guardian', tenant.id, user.id] }),
        queryClient.invalidateQueries({ queryKey: ['parent-portal', tenant.id, user.id] }),
      ]);
      onComplete(person.id, person.date_of_birth ?? dateOfBirth);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">{t('pages.enrolment.guardian_setup_title')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('pages.enrolment.guardian_setup_desc')}</p>
      </div>

      {mode === 'create' && (
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('form.person.name')}</span>
          <input
            type="text"
            required
            className="w-full border rounded px-3 py-2 bg-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
        </label>
      )}

      <label className="block text-sm">
        <span className="block font-medium mb-1">{t('form.person.date_of_birth')}</span>
        <input
          type="date"
          required
          className="w-full border rounded px-3 py-2 bg-white"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </label>

      {mode === 'create' && (
        <label className="block text-sm">
          <span className="block font-medium mb-1">{t('form.person.phone')}</span>
          <input
            type="tel"
            className="w-full border rounded px-3 py-2 bg-white"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={isSubmitting} isLoading={isSubmitting}>
          {t('pages.enrolment.guardian_setup_submit')}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
