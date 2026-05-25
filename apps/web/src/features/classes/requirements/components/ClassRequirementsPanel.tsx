import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useRequirements, useRequirementTemplates } from '../hooks/useRequirements';

interface ClassRequirementsPanelProps {
  classId: string;
  className: string;
}

export function ClassRequirementsPanel({ classId, className }: ClassRequirementsPanelProps) {
  const { t } = useTranslation();
  const { requirements, isLoading, error, linkTemplate, deleteRequirement, isLinking, isDeleting } =
    useRequirements(classId);
  const templatesQuery = useRequirementTemplates();

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Templates not yet linked to this class
  const linkedTemplateIds = new Set(
    requirements.map((r) => r.requirement_template_id).filter(Boolean)
  );
  const availableTemplates = (templatesQuery.data ?? []).filter(
    (tpl) => !linkedTemplateIds.has(tpl.id)
  );

  const handleLink = () => {
    if (!selectedTemplateId) return;
    setLinkError(null);
    linkTemplate(selectedTemplateId, {
      onSuccess: () => {
        setSelectedTemplateId('');
        setShowAdd(false);
      },
      onError: (err) => {
        setLinkError(err instanceof Error ? err.message : 'Failed to link requirement');
      },
    });
  };

  const handleDelete = (id: string) => {
    deleteRequirement(id, {
      onSuccess: () => setConfirmDeleteId(null),
    });
  };

  const typeLabel = (type: string) => {
    const key = `form.requirement.type_${type}`;
    const translated = t(key);
    return translated === key ? type : translated;
  };

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdd(true)}
            disabled={availableTemplates.length === 0 && !templatesQuery.isLoading}
          >
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
        <p className="text-sm py-2" style={{ color: 'var(--color-danger, #dc2626)' }}>
          {error}
        </p>
      )}

      {/* Empty state */}
      {!isLoading && requirements.length === 0 && !showAdd && (
        <p className="text-sm py-2 italic" style={{ color: 'var(--color-text-muted)' }}>
          {t('pages.admin_classes.requirements_empty')}
        </p>
      )}

      {/* No templates exist at all */}
      {!isLoading && availableTemplates.length === 0 && requirements.length === 0 && !templatesQuery.isLoading && (
        <p className="text-sm py-1" style={{ color: 'var(--color-text-muted)' }}>
          {t('form.requirement.no_templates')}
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
                    <span
                      className="text-xs ml-2"
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
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
            );
          })}
        </ul>
      )}

      {/* Add form — select from available templates */}
      {showAdd && (
        <div
          className="rounded-md border p-4 space-y-3"
          style={{
            borderColor: 'var(--color-border-default)',
            backgroundColor: 'var(--color-surface-default, white)',
          }}
        >
          <p className="text-sm font-medium">
            {t('pages.admin_classes.requirements_add_title')}
          </p>

          {templatesQuery.isLoading ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('common.loading')}
            </p>
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
              {availableTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                  {tpl.requirement_type ? ` (${typeLabel(tpl.requirement_type)})` : ''}
                </option>
              ))}
            </select>
          )}

          {linkError && (
            <p className="text-sm" style={{ color: 'var(--color-danger, #dc2626)' }}>
              {linkError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              size="sm"
              onClick={handleLink}
              disabled={!selectedTemplateId || isLinking}
            >
              {isLinking ? t('common.loading') : t('form.requirement.link_button')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAdd(false);
                setSelectedTemplateId('');
                setLinkError(null);
              }}
              disabled={isLinking}
            >
              {t('form.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
