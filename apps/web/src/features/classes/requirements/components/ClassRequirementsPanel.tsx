import { useRef, useState } from 'react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useRequirements, useRequirementTemplates } from '../hooks/useRequirements';
import { useLevels } from '@/features/levels/hooks/useLevels';
import type { RequirementTemplate } from '@shared/schemas';

// ── Types ─────────────────────────────────────────────────────────────────────

type RequirementType = 'age_range' | 'gender' | 'level' | 'document_submitted' | 'manual_review';

interface CreateFormState {
  name: string;
  requirement_type: RequirementType | '';
  display_text: string;
  is_hard_block: boolean;
  // config fields
  min_age: string;
  max_age: string;
  gender_male: boolean;
  gender_female: boolean;
  level_id: string;
  doc_type: string;
}

const EMPTY_CREATE: CreateFormState = {
  name: '',
  requirement_type: '',
  display_text: '',
  is_hard_block: true,
  min_age: '',
  max_age: '',
  gender_male: false,
  gender_female: false,
  level_id: '',
  doc_type: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildConfig(form: CreateFormState): Record<string, unknown> {
  switch (form.requirement_type) {
    case 'age_range': {
      const cfg: Record<string, unknown> = { min_age: Number(form.min_age) };
      if (form.max_age) cfg.max_age = Number(form.max_age);
      return cfg;
    }
    case 'gender': {
      const allowed: string[] = [];
      if (form.gender_male) allowed.push('male');
      if (form.gender_female) allowed.push('female');
      return { allowed_genders: allowed };
    }
    case 'level':
      return { level_id: form.level_id };
    case 'document_submitted':
      return { doc_type: form.doc_type };
    default:
      return {};
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ClassRequirementsPanelProps {
  classId: string;
  className: string;
}

type AddMode = 'link' | 'create';

export function ClassRequirementsPanel({ classId, className }: ClassRequirementsPanelProps) {
  const { t } = useTranslation();

  const { requirements, isLoading, error, linkTemplate, deleteRequirement, isLinking, isDeleting } =
    useRequirements(classId);
  const { templates, isLoading: templatesLoading, createTemplate, isCreating } =
    useRequirementTemplates();
  const levelsData = useLevels({ page: 1 });

  const nameInputRef = useRef<HTMLInputElement>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('link');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_CREATE);
  const [createError, setCreateError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Templates not yet linked to this class
  const linkedTemplateIds = new Set(
    requirements.map((r) => r.requirement_template_id).filter(Boolean)
  );
  const availableTemplates = templates.filter((tpl: RequirementTemplate) => !linkedTemplateIds.has(tpl.id));

  const closeAdd = () => {
    setShowAdd(false);
    setAddMode('link');
    setSelectedTemplateId('');
    setCreateForm(EMPTY_CREATE);
    setCreateError(null);
    setLinkError(null);
  };

  // ── Link existing ──────────────────────────────────────────────────────────
  const handleLink = () => {
    if (!selectedTemplateId) return;
    setLinkError(null);
    linkTemplate(selectedTemplateId, {
      onSuccess: closeAdd,
      onError: (err) => setLinkError(err instanceof Error ? err.message : 'Failed to link'),
    });
  };

  // ── Create + link ──────────────────────────────────────────────────────────
  const handleCreateAndLink = () => {
    const { name, requirement_type, display_text, is_hard_block } = createForm;
    if (!name.trim() || !requirement_type) {
      setCreateError(t('common.required_fields'));
      return;
    }
    if (requirement_type === 'age_range' && !createForm.min_age) {
      setCreateError(t('common.required_fields'));
      return;
    }
    if (requirement_type === 'gender' && !createForm.gender_male && !createForm.gender_female) {
      setCreateError(t('common.required_fields'));
      return;
    }
    if (requirement_type === 'level' && !createForm.level_id) {
      setCreateError(t('common.required_fields'));
      return;
    }
    if (requirement_type === 'document_submitted' && !createForm.doc_type.trim()) {
      setCreateError(t('common.required_fields'));
      return;
    }

    setCreateError(null);
    const config = buildConfig(createForm);

    createTemplate(
      {
        name: name.trim(),
        requirement_type,
        config,
        display_text: display_text.trim() || undefined,
        is_hard_block,
      },
      {
        onSuccess: (newTemplate) => {
          linkTemplate(newTemplate.id, {
            onSuccess: closeAdd,
            onError: (err) =>
              setCreateError(err instanceof Error ? err.message : 'Created but failed to link'),
          });
        },
        onError: (err) =>
          setCreateError(err instanceof Error ? err.message : 'Failed to create requirement'),
      }
    );
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    deleteRequirement(id, { onSuccess: () => setConfirmDeleteId(null) });
  };

  const typeLabel = (type: string) => {
    const key = `form.requirement.type_${type}`;
    const v = t(key);
    return v === key ? type : v;
  };

  const isBusy = isCreating || isLinking;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="border-t px-6 py-4"
      style={{
        borderColor: 'var(--color-border-default)',
        backgroundColor: 'var(--color-surface-subtle, #f9fafb)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
          {t('pages.admin_classes.requirements_for', { name: className })}
        </h3>
        {!showAdd && (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            + {t('form.requirement.add_button')}
          </Button>
        )}
      </div>

      {isLoading && (
        <p className="text-sm py-2" style={{ color: 'var(--color-text-muted)' }}>
          {t('common.loading')}
        </p>
      )}
      {error && (
        <p className="text-sm py-2" style={{ color: 'var(--color-danger, #dc2626)' }}>{error}</p>
      )}

      {!isLoading && requirements.length === 0 && !showAdd && (
        <p className="text-sm py-2 italic" style={{ color: 'var(--color-text-muted)' }}>
          {t('pages.admin_classes.requirements_empty')}
        </p>
      )}

      {/* Linked requirements list */}
      {requirements.length > 0 && (
        <ul className="space-y-2 mb-3">
          {requirements.map((req) => {
            const tpl = req.requirement_templates;
            return (
              <li
                key={req.id}
                className="flex items-start justify-between rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--color-border-default)',
                  backgroundColor: 'var(--color-surface-default, white)',
                }}
              >
                <div className="space-y-0.5">
                  <span className="font-medium">{tpl?.name ?? req.id}</span>
                  {tpl?.requirement_type && (
                    <span className="text-xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
                      {typeLabel(tpl.requirement_type)}
                    </span>
                  )}
                  {tpl?.display_text && (
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {tpl.display_text}
                    </p>
                  )}
                  {tpl?.is_hard_block && (
                    <span
                      className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--color-danger-subtle, #fef2f2)',
                        color: 'var(--color-danger, #dc2626)',
                      }}
                    >
                      {t('form.requirement.is_hard_block')}
                    </span>
                  )}
                </div>

                {confirmDeleteId === req.id ? (
                  <div className="flex items-center gap-2 shrink-0 ms-4">
                    <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {t('form.requirement.delete_confirm')}
                    </span>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(req.id)} disabled={isDeleting}>
                      {t('common.delete')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)} disabled={isDeleting}>
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
            );
          })}
        </ul>
      )}

      {/* Add panel */}
      {showAdd && (
        <div
          className="rounded-md border p-4 space-y-3"
          style={{
            borderColor: 'var(--color-border-default)',
            backgroundColor: 'var(--color-surface-default, white)',
          }}
        >
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              variant={addMode === 'link' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => { setAddMode('link'); setCreateError(null); setLinkError(null); }}
            >
              {t('form.requirement.link_button')}
            </Button>
            <Button
              variant={addMode === 'create' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                setAddMode('create');
                setCreateError(null);
                setLinkError(null);
                setTimeout(() => nameInputRef.current?.focus(), 0);
              }}
            >
              {t('form.requirement.create_and_link_button')}
            </Button>
            <Button variant="ghost" size="sm" className="ms-auto" onClick={closeAdd}>
              {t('form.cancel')}
            </Button>
          </div>

          {/* ── Link existing ── */}
          {addMode === 'link' && (
            <div className="space-y-3">
              {templatesLoading ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</p>
              ) : availableTemplates.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {t('form.requirement.no_templates')}
                </p>
              ) : (
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">{t('form.requirement.select_placeholder')}</option>
                  {availableTemplates.map((tpl: RequirementTemplate) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}{tpl.requirement_type ? ` (${typeLabel(tpl.requirement_type)})` : ''}
                    </option>
                  ))}
                </select>
              )}
              {linkError && (
                <p className="text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>{linkError}</p>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleLink}
                disabled={!selectedTemplateId || isBusy}
              >
                {isBusy ? t('common.loading') : t('form.requirement.link_button')}
              </Button>
            </div>
          )}

          {/* ── Create & link new ── */}
          {addMode === 'create' && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('form.requirement.create_modal_title')}</p>

              {/* Name */}
              <Field label={t('pages.admin.requirements.name_label')}>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  ref={nameInputRef}
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>

              {/* Type */}
              <Field label={t('form.requirement.type')}>
                <select
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  value={createForm.requirement_type}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...EMPTY_CREATE,
                      name: f.name,
                      display_text: f.display_text,
                      is_hard_block: f.is_hard_block,
                      requirement_type: e.target.value as RequirementType,
                    }))
                  }
                >
                  <option value="">{t('form.requirement.select_placeholder')}</option>
                  <option value="age_range">{t('form.requirement.type_age_range')}</option>
                  <option value="gender">{t('form.requirement.type_gender')}</option>
                  <option value="level">{t('form.requirement.type_level')}</option>
                  <option value="document_submitted">{t('form.requirement.type_document_submitted')}</option>
                  <option value="manual_review">{t('form.requirement.type_manual_review')}</option>
                </select>
              </Field>

              {/* Conditional config fields */}
              {createForm.requirement_type === 'age_range' && (
                <div className="space-y-2 rounded-md border p-3"
                  style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-subtle, #f9fafb)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    {t('form.requirement.config_section')}
                  </p>
                  <Field label={t('form.requirement.min_age')}>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--color-border-default)' }}
                      value={createForm.min_age}
                      onChange={(e) => setCreateForm((f) => ({ ...f, min_age: e.target.value }))}
                    />
                  </Field>
                  <Field label={t('form.requirement.max_age')}>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--color-border-default)' }}
                      value={createForm.max_age}
                      onChange={(e) => setCreateForm((f) => ({ ...f, max_age: e.target.value }))}
                    />
                  </Field>
                </div>
              )}

              {createForm.requirement_type === 'gender' && (
                <div className="space-y-2 rounded-md border p-3"
                  style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-subtle, #f9fafb)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                    {t('form.requirement.allowed_genders')}
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={createForm.gender_male}
                      onChange={(e) => setCreateForm((f) => ({ ...f, gender_male: e.target.checked }))}
                    />
                    <span className="text-sm">{t('form.requirement.gender_male')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={createForm.gender_female}
                      onChange={(e) => setCreateForm((f) => ({ ...f, gender_female: e.target.checked }))}
                    />
                    <span className="text-sm">{t('form.requirement.gender_female')}</span>
                  </label>
                </div>
              )}

              {createForm.requirement_type === 'level' && (
                <div className="space-y-2 rounded-md border p-3"
                  style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-subtle, #f9fafb)' }}>
                  <Field label={t('form.requirement.level_id')}>
                    {levelsData.isLoading ? (
                      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{t('common.loading')}</p>
                    ) : (
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        style={{ borderColor: 'var(--color-border-default)' }}
                        value={createForm.level_id}
                        onChange={(e) => setCreateForm((f) => ({ ...f, level_id: e.target.value }))}
                      >
                        <option value="">—</option>
                        {levelsData.levels.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
              )}

              {createForm.requirement_type === 'document_submitted' && (
                <div className="space-y-2 rounded-md border p-3"
                  style={{ borderColor: 'var(--color-border-default)', backgroundColor: 'var(--color-surface-subtle, #f9fafb)' }}>
                  <Field label={t('form.requirement.doc_type')}>
                    <input
                      type="text"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      style={{ borderColor: 'var(--color-border-default)' }}
                      placeholder={t('form.requirement.doc_type_hint')}
                      value={createForm.doc_type}
                      onChange={(e) => setCreateForm((f) => ({ ...f, doc_type: e.target.value }))}
                    />
                  </Field>
                </div>
              )}

              {/* Display text */}
              <Field label={t('pages.admin.requirements.display_text_label')}>
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-default)' }}
                  placeholder={t('pages.admin.requirements.display_text_help')}
                  value={createForm.display_text}
                  onChange={(e) => setCreateForm((f) => ({ ...f, display_text: e.target.value }))}
                />
              </Field>

              {/* Hard block */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={createForm.is_hard_block}
                  onChange={(e) => setCreateForm((f) => ({ ...f, is_hard_block: e.target.checked }))}
                />
                <span className="text-sm font-medium">{t('form.requirement.is_hard_block')}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  — {t('form.requirement.is_hard_block_hint')}
                </span>
              </label>

              {createError && (
                <p className="text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>{createError}</p>
              )}

              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateAndLink}
                disabled={isBusy || !createForm.name.trim() || !createForm.requirement_type}
              >
                {isBusy ? t('common.loading') : t('form.requirement.create_and_link_button')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Small helper to keep label/input pairs tidy ───────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}
