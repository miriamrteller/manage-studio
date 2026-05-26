import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useTenant } from '@/hooks/useTenant';
import { usePerson } from '../hooks/usePerson';
import { PersonForm } from './PersonForm';
import { PersonService } from '../service';
import { MedicalNotes } from './MedicalNotes';
import { formatDate, calculateAge } from '@/lib/utils';

interface PersonDetailProps {
  id: string;
  onClose?: () => void;
}

/**
 * PersonDetail: Display person details with edit/delete actions
 * - Fetches person data with usePerson hook
 * - Shows medical notes (RLS-restricted)
 * - Edit button opens PersonForm
 * - Delete button with confirmation dialog
 * - Accessibility: Heading hierarchy (h2), focus management, keyboard navigation
 * - WCAG 2.1 AA compliant
 */
export function PersonDetail({ id, onClose }: PersonDetailProps) {
  const { t } = useTranslation();
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: person, isLoading, error } = usePerson(id);

  if (isLoading) {
    return (
      <div className="p-4">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
        <p className="text-red-700">{t('errors.server_error')}</p>
      </div>
    );
  }

  if (!person) {
    return (
      <div className="p-4">
        <p>{t('errors.not_found')}</p>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center p-4 border-b">
            <h2 className="text-xl font-semibold">
              {t('pages.people.edit_title')}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(false)}
              className="text-gray-500 hover:text-gray-700"
              aria-label={t('common.close')}
            >
              ✕
            </Button>
          </div>
          <PersonForm
            person={person}
            onSubmit={async (data) => {
              if (!tenant) throw new Error('Tenant not initialized');
              await PersonService.update(tenant, person.id, data);
              await queryClient.invalidateQueries({ queryKey: ['person', tenant.id, id] });
              await queryClient.invalidateQueries({ queryKey: ['students', tenant.id] });
              await queryClient.invalidateQueries({
                queryKey: ['student-detail-person', tenant.id, id],
              });
              setIsEditing(false);
            }}
          />
        </div>
      </div>
    );
  }

  const age = person.date_of_birth
    ? calculateAge(person.date_of_birth)
    : undefined;

  return (
    <div className="space-y-6 p-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{person.name}</h2>
          {age !== undefined && (
            <p className="text-gray-600">{t('pages.people.age_label')}: {age}</p>
          )}
        </div>
        {onClose && (
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
        )}
      </div>

      {/* Person Details */}
      <dl className="space-y-4">
        {person.email && (
          <div>
            <dt className="font-semibold text-gray-700">
              {t('pages.people.email_label')}
            </dt>
            <dd className="text-gray-900">{person.email}</dd>
          </div>
        )}

        {person.date_of_birth && (
          <div>
            <dt className="font-semibold text-gray-700">
              {t('pages.people.date_of_birth_label')}
            </dt>
            <dd className="text-gray-900">
              {formatDate(person.date_of_birth)}
            </dd>
          </div>
        )}

        {person.emergency_contact_name && (
          <>
            <div>
              <dt className="font-semibold text-gray-700">
                {t('pages.people.emergency_contact_name_label')}
              </dt>
              <dd className="text-gray-900">{person.emergency_contact_name}</dd>
            </div>
            {person.emergency_contact_phone && (
              <div>
                <dt className="font-semibold text-gray-700">
                  {t('pages.people.emergency_contact_phone_label')}
                </dt>
                <dd className="text-gray-900">
                  {person.emergency_contact_phone}
                </dd>
              </div>
            )}
          </>
        )}

        {person.allergies && (
          <div>
            <dt className="font-semibold text-gray-700">
              {t('pages.people.allergies_label')}
            </dt>
            <dd className="text-gray-900">{person.allergies}</dd>
          </div>
        )}

        {person.status && (
          <div>
            <dt className="font-semibold text-gray-700">
              {t('common.status')}
            </dt>
            <dd className="text-gray-900">
              {t(`pages.people.status_${person.status}`)}
            </dd>
          </div>
        )}
      </dl>

      {/* Medical Notes — Staff Only (RLS-restricted) */}
      {person.medical_notes && (
        <div>
          <MedicalNotes notes={person.medical_notes} />
        </div>
      )}

      {/* Consent Status */}
      {(person.photo_consent !== undefined ||
        person.media_consent !== undefined) && (
        <div className="space-y-2 p-4 bg-gray-50 rounded border">
          <h3 className="font-semibold">{t('pages.people.consent_label')}</h3>
          {person.photo_consent !== undefined && (
            <div className="flex items-center gap-2">
              <span>{t('pages.people.photo_consent_label')}:</span>
              <span className={person.photo_consent ? 'text-green-600' : 'text-gray-400'}>
                {person.photo_consent ? '✓' : '✗'}
              </span>
            </div>
          )}
          {person.media_consent !== undefined && (
            <div className="flex items-center gap-2">
              <span>{t('pages.people.media_consent_label')}:</span>
              <span className={person.media_consent ? 'text-green-600' : 'text-gray-400'}>
                {person.media_consent ? '✓' : '✗'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Waiver Status */}
      {(person.waiver_version || person.waiver_accepted_at) && (
        <div className="p-4 bg-blue-50 rounded border border-blue-200">
          <p className="font-semibold text-blue-900">
            {t('pages.people.waiver_status_label')}
          </p>
          <p className="text-blue-800">
            {person.waiver_accepted_at
              ? t('pages.people.waiver_accepted')
              : t('pages.people.waiver_pending')}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4">
        <Button
          variant="primary"
          onClick={() => setIsEditing(true)}
        >
          {t('common.edit')}
        </Button>
      </div>

      {/* Data removal note — hard delete is not permitted per SPEC §D / migration 039 */}
      <p className="text-xs text-gray-400 pt-2">{t('pages.people.delete_note')}</p>
    </div>
  );
}
