import { useTranslation } from 'react-i18next';

interface MedicalNotesProps {
  notes?: string | null;
}

/**
 * MedicalNotes: Display medical notes (staff-only via RLS)
 * - Attempts to display medical notes from database
 * - RLS policy blocks non-staff access; shows fallback
 * - No client-side permission check; audit logging via database trigger
 * - Component structure allows for future audit logging UI
 */
export function MedicalNotes({ notes }: MedicalNotesProps) {
  const { t } = useTranslation();

  if (!notes) {
    return (
      <div className="p-4 bg-gray-50 rounded border border-gray-200">
        <p className="text-sm text-gray-600">
          {t('pages.people.medical_notes_not_available')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-blue-50 rounded border border-blue-200">
      <h3 className="font-semibold mb-2 text-blue-900">
        {t('pages.people.medical_notes_label')}
      </h3>
      <p className="whitespace-pre-wrap text-sm text-blue-800">
        {notes}
      </p>
      <p className="text-xs text-blue-700 mt-2">
        {t('pages.people.medical_notes_staff_only')}
      </p>
    </div>
  );
}
