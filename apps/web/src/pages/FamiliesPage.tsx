import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { FamilyForm } from '@/features/families/components/FamilyForm';
import { FamiliesList } from '@/features/families/components/FamiliesList';
import { useFamilies } from '@/features/families/hooks/useFamilies';
import type { Family } from '@shared/schemas';

// Schema source: SPEC.md Migration 002
// FamiliesPage wrapper component for admin interface
// Displays FamilyForm for creating new families and FamiliesList for managing existing families

export default function FamiliesPage() {
  const { t } = useTranslation();
  const { createFamily, updateFamily, isCreating, isUpdating } = useFamilies();
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);

  const handleFormSubmit = async (data: Partial<Family>) => {
    try {
      if (editingFamily?.id) {
        // Update existing family
        await new Promise((resolve, reject) => {
          updateFamily(
            { ...editingFamily, ...data } as Family,
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });
      } else {
        // Create new family
        await new Promise((resolve, reject) => {
          createFamily(
            data as Omit<Family, 'id' | 'created_at'>,
            {
              onSuccess: resolve,
              onError: reject,
            }
          );
        });
      }

      setFormSuccess(true);
      setEditingFamily(null);
      setShowForm(false);

      // Clear success message after 3 seconds
      setTimeout(() => setFormSuccess(false), 3000);
    } catch (error) {
      console.error('Form submission failed:', error);
      throw error;
    }
  };

  const handleEditFamily = (family: Family) => {
    setEditingFamily(family);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setEditingFamily(null);
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
                {t('common.add_family')}
              </h1>
              <p className="mt-2 text-gray-600">
                {editingFamily
                  ? t('common.edit_family', { name: editingFamily.name })
                  : t('common.manage_families') || 'Manage Families'}
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
                : editingFamily
                  ? t('form.cancel')
                  : t('common.add_family')}
            </Button>
          </div>
        </div>

        {/* Success message */}
        {formSuccess && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">
            {editingFamily
              ? t('common.success_updated')
              : t('common.success_created')}
          </div>
        )}

        {/* Form section */}
        {showForm && (
          <div className="mb-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {editingFamily
                ? t('common.edit_family', { name: editingFamily.name })
                : t('common.add_family')}
            </h2>
            <FamilyForm
              family={editingFamily || undefined}
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
              {t('common.manage_families') || 'Families'}
            </h2>
          </div>
          <FamiliesList onEdit={handleEditFamily} />
        </div>
      </div>
    </div>
  );
}
