import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useRequirements } from '../hooks/useRequirements';
import type { ClassRequirement } from '@shared/schemas';

type RequirementType = 'min_age' | 'prerequisite_class' | 'admin_approval';

interface ClassRequirementsPanelProps {
  classId: string;
  className: string;
}

interface AddFormState {
  requirement_type: RequirementType | '';
  value: string;
  display_text: string;
  is_hard_block: boolean;
}

const EMPTY_FORM: AddFormState = {
  requirement_type: '',
  value: '',
  display_text: '',
  is_hard_block: true,
};

export function ClassRequirementsPanel({ classId, className }: ClassRequirementsPanelProps) {
  const { t } = useTranslation();
  const { requirements, isLoading, createRequirement, deleteRequirement, isCreating, isDeleting } =
    useRequirements({ classId, enabled: true });

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddFormState>(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!form.requirement_type) return;

    setAddError(null);
    const payload: Partial<ClassRequirement> = {
      class_id: classId,
      requirement_type: form.requirement_type,
      value: form.requirement_type === 'admin_approval' ? 'true' : form.value.trim(),
      display_text: form.display_text.trim(),
      is_hard_block: form.is_hard_block,
    };

    createRequirement(payload, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setShowAddForm(false);
      },
      onError: (err) => {
        setAddError(err instanceof Error ? err.message : 'Failed to add requirement');
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteRequirement(id, {
      onSuccess: () => setConfirmDeleteId(null),
    });
  };

  const typeLabel = (type: RequirementType) => t(`form.requirement.type_${type}`);
  const showValueField = form.requirement_type && form.requirement_type !== 'admin_approval';

  return (
    <div className="border-t px-6 py-4" style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-subtle, #f9fafb)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          {t('pages.admin_classes.requirements_for', { name: className })}
        </h3>
        {!showAddForm && (
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
            + {t('form.requirement.add_button')}
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('common.loading')}
        </p>
      )}

      {!isLoading && requirements.length === 0 && !showAddForm && (
        <p className="text-sm py-2 italic" style={{ color: 'var(--color-text-muted)' }}>
          {t('pages.admin_classes.requirements_empty')}
        </p>
      )}

      {requirements.length > 0 && (
        <ul className="space-y-2 mb-3">
          {requirements.map((req) => (
            <li
              key={req.id}
              className="flex items-start justify-between rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-default, white)' }}
            >
              <div className="space-y-0.5">
                <span className="font-medium">{typeLabel(req.requirement_type)}</span>
                {req.requirement_type !== 'admin_approval' && req.value && (
                  <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                    {req.value}
                  </span>
                )}
                {req.display_text && (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {req.display_text}
                  </p>
                )}
                {req.is_hard_block && (
                  <span className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--color-danger-subtle, #fef2f2)', color: 'var(--color-danger, #dc2626)' }}>
                    {t('form.requirement.is_hard_block')}
                  </span>
                )}
              </div>

              {confirmDeleteId === req.id ? (
                <div className="flex items-center gap-2 shrink-0 ms-4">
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {t('form.requirement.delete_confirm')}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(req.id)}
                    disabled={isDeleting}
                  >
                    {t('common.delete')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={isDeleting}
                  >
                    {t('form.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteId(req.id)}
                  className="shrink-0 ms-4"
                  aria-label={t('common.delete')}
                >
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {showAddForm && (
        <div
          className="rounded-md border p-4 space-y-3"
          style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-default, white)' }}
        >
          <p className="text-sm font-medium">{t('pages.admin_classes.requirements_add_title')}</p>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              {t('form.requirement.type')}
            </label>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border-default)' }}
              value={form.requirement_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, requirement_type: e.target.value as RequirementType | '', value: '' }))
              }
            >
              <option value="">{t('form.requirement.type_select_placeholder')}</option>
              <option value="min_age">{t('form.requirement.type_min_age')}</option>
              <option value="prerequisite_class">{t('form.requirement.type_prerequisite_class')}</option>
              <option value="admin_approval">{t('form.requirement.type_admin_approval')}</option>
            </select>
          </div>

          {/* Value (conditional) */}
          {showValueField && (
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                {t('form.requirement.value')}
              </label>
              <input
                type={form.requirement_type === 'min_age' ? 'number' : 'text'}
                min={form.requirement_type === 'min_age' ? 1 : undefined}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border-default)' }}
                placeholder={
                  form.requirement_type === 'min_age'
                    ? t('form.requirement.value_age_hint')
                    : t('form.requirement.value_class_hint')
                }
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              />
            </div>
          )}

          {/* Display text */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
              {t('form.requirement.display_text')}
            </label>
            <input
              type="text"
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border-default)' }}
              placeholder={t('form.requirement.display_text_hint')}
              value={form.display_text}
              onChange={(e) => setForm((f) => ({ ...f, display_text: e.target.value }))}
            />
          </div>

          {/* Hard block */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.is_hard_block}
              onChange={(e) => setForm((f) => ({ ...f, is_hard_block: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm">{t('form.requirement.is_hard_block')}</span>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              — {t('form.requirement.is_hard_block_hint')}
            </span>
          </label>

          {addError && (
            <p className="text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {addError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleAdd}
              disabled={!form.requirement_type || isCreating}
            >
              {isCreating ? t('common.loading') : t('form.requirement.add_button')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddForm(false);
                setForm(EMPTY_FORM);
                setAddError(null);
              }}
              disabled={isCreating}
            >
              {t('form.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
