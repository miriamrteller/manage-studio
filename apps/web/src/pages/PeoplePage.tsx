import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PersonForm } from '@/features/people/components/PersonForm';
import { PeopleList } from '@/features/people/components/PeopleList';
import { usePeople } from '@/features/people/hooks/usePeople';
import type { Person } from '@shared/schemas';

// Schema source: SPEC.md Migration 002
// PeoplePage wrapper component for admin interface
// Displays PersonForm for creating new people and PeopleList for managing existing people

export default function PeoplePage() {
  const { t } = useTranslation();
  const { createPerson, updatePerson, isCreating, isUpdating } = usePeople();
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  const handleFormSubmit = async (data: Partial<Person>) => {
    try {
      if (editingPerson?.id) {
        // Update existing person
        await new Promise((resolve, reject) => {
          updatePerson(
            { ...editingPerson, ...data } as Person,
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });
      } else {
        // Create new person
        await new Promise((resolve, reject) => {
          createPerson(
            data as Omit<Person, 'id' | 'created_at' | 'is_minor'>,
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });
      }

      setFormSuccess(true);
      setEditingPerson(null);
      setShowForm(false);

      // Clear success message after 3 seconds
      setTimeout(() => setFormSuccess(false), 3000);
    } catch (error) {
      console.error('Form submission failed:', error);
      throw error;
    }
  };

  const handleCloseForm = () => {
    setEditingPerson(null);
    setShowForm(false);
    setFormSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {t('common.add_person')}
              </h1>
              <p className="mt-2 text-gray-600">
                {editingPerson
                  ? t('common.edit_person', { name: editingPerson.name })
                  : t('common.manage_people') || 'Manage People'}
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                if (showForm) {
                  handleCloseForm();
                } else {
                  setShowForm(true);
                }
              }}
            >
              {showForm
                ? t('form.cancel')
                : editingPerson
                  ? t('form.cancel')
                  : t('common.add_person')}
            </Button>
          </div>
        </div>

        {/* Success message */}
        {formSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">
            {editingPerson
              ? t('common.success_updated')
              : t('common.success_created')}
          </div>
        )}

        {/* Form section */}
        {showForm && (
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingPerson
                ? t('common.edit_person', { name: editingPerson.name })
                : t('common.add_person')}
            </h2>
            <PersonForm
              person={editingPerson || undefined}
              onSubmit={handleFormSubmit}
              isLoading={isCreating || isUpdating}
            />
            <Button
              variant="outline"
              onClick={handleCloseForm}
              className="mt-4"
            >
              {t('form.cancel')}
            </Button>
          </div>
        )}

        {/* List section */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              {t('common.manage_people') || 'People'}
            </h2>
          </div>
          <PeopleList />
        </div>
      </div>
    </div>
  );
}
