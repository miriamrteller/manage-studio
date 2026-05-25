import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared';
import { useRequirementTemplates } from '../hooks/useRequirements';
import type { RequirementTemplate } from '@shared/schemas';

const REQUIREMENT_TYPES = [
  'age_range',
  'gender',
  'level',
  'document_submitted',
  'manual_review',
] as const;

interface FormState {
  name: string;
  requirement_type: string;
  display_text: string;
  is_hard_block: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  requirement_type: '',
  display_text: '',
  is_hard_block: true,
};

export function RequirementTemplatesList() {
  const { t } = useTranslation();
  const { templates, isLoading, error, createTemplate, deleteTemplate, isCreating, isDeleting } =
    useRequirementTemplates();

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!form.name.trim() || !form.requirement_type) {
      setFormError(t('common.required_fields'));
      return;
    }
    setFormError(null);
    createTemplate(
      {
        name: form.name.trim(),
        requirement_type: form.requirement_type,
        config: {},
        display_text: form.display_text.trim() || undefined,
        is_hard_block: form.is_hard_block,
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM);
          setIsAdding(false);
        },
        onError: (err) => {
          setFormError(err instanceof Error ? err.message : 'Failed to create requirement');
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id, { onSuccess: () => setConfirmDeleteId(null) });
  };

  const typeLabel = (type: string) => {
    const key = `form.requirement.type_${type}`;
    const translated = t(key);
    return translated === key ? type : translated;
  };

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('pages.admin.requirements.title')}</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t('pages.admin.requirements.description')}
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setIsAdding(true)} disabled={isAdding}>
          {t('pages.admin.requirements.create_button')}
        </Button>
      </div>

      {isLoading && <div className="py-4 text-center">{t('common.loading')}</div>}

      {error && (
        <div className="alert-error">
          {t('common.error')}: {error}
        </div>
      )}

      {!isLoading && templates.length === 0 && !isAdding && (
        <EmptyState
          title={t('pages.admin.requirements.empty_title')}
          message={t('pages.admin.requirements.empty_message')}
          actionLabel={t('pages.admin.requirements.create_button')}
          onAction={() => setIsAdding(true)}
        />
      )}

      {/* Add form */}
      {isAdding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-lg">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-xl font-semibold">
                {t('pages.admin.requirements.create_button')}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setIsAdding(false); setForm(EMPTY_FORM); setFormError(null); }}
                aria-label={t('common.close')}
              >
                ✕
              </Button>
            </div>

            <div className="space-y-4 p-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('pages.admin.requirements.name_label')}
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('form.requirement.type')}
                </label>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  value={form.requirement_type}
                  onChange={(e) => setForm((f) => ({ ...f, requirement_type: e.target.value }))}
                >
                  <option value="">{t('form.requirement.select_placeholder')}</option>
                  {REQUIREMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {typeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Display text */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('pages.admin.requirements.display_text_label')}
                </label>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  placeholder={t('pages.admin.requirements.display_text_help')}
                  value={form.display_text}
                  onChange={(e) => setForm((f) => ({ ...f, display_text: e.target.value }))}
                />
              </div>

              {/* Hard block */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_hard_block}
                  onChange={(e) => setForm((f) => ({ ...f, is_hard_block: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-medium">{t('form.requirement.is_hard_block')}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  — {t('form.requirement.is_hard_block_hint')}
                </span>
              </label>

              {formError && (
                <p className="text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>
                  {formError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  onClick={handleCreate}
                  disabled={isCreating}
                >
                  {isCreating ? t('common.loading') : t('common.save')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setIsAdding(false); setForm(EMPTY_FORM); setFormError(null); }}
                  disabled={isCreating}
                >
                  {t('form.cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {templates.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b" style={{ borderColor: 'var(--color-border-default)' }}>
              <tr>
                <th className="px-4 py-3 text-start font-medium">
                  {t('pages.admin.requirements.name_label')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('form.requirement.type')}
                </th>
                <th className="px-4 py-3 text-start font-medium">
                  {t('pages.admin.requirements.display_text_label')}
                </th>
                <th className="px-4 py-3 text-center font-medium">
                  {t('form.requirement.is_hard_block')}
                </th>
                <th className="px-4 py-3 text-center font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl: RequirementTemplate) => (
                <tr
                  key={tpl.id}
                  className="border-b"
                  style={{ borderColor: 'var(--color-border-default)' }}
                >
                  <td className="px-4 py-3 font-medium">{tpl.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {typeLabel(tpl.requirement_type)}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                    {tpl.display_text ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {tpl.is_hard_block ? (
                      <span
                        className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--color-danger-subtle, #fef2f2)',
                          color: 'var(--color-danger, #dc2626)',
                        }}
                      >
                        {t('pages.admin.requirements.hard_block_label')}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {t('pages.admin.requirements.soft_block_label')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {confirmDeleteId === tpl.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(tpl.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? t('common.loading') : t('common.delete')}
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
                      <div className="flex justify-center">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirmDeleteId(tpl.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
