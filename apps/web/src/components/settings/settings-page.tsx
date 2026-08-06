import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, type FieldValues } from 'react-hook-form';
import { cn } from '@/lib/utils';
import {
  SettingsLayout,
  type SettingsSection,
  type SettingsSectionProps,
} from '@/components/settings/SettingsLayout';
import { ToastContainer, type ToastItemProps } from '@/components/ui/toast';
import { EmptyState } from '@/components/ui/empty-state';
import { ProfileSection } from '@/components/settings/sections/ProfileSection';
import { NotificationSection } from '@/components/settings/sections/NotificationSection';
import { SecuritySection } from '@/components/settings/sections/SecuritySection';
import { BusinessSection } from '@/components/settings/sections/BusinessSection';
import { IntegrationSection } from '@/components/settings/sections/IntegrationSection';
import { BillingSection } from '@/components/settings/sections/BillingSection';

/** Default registry. The order here is the order shown in the tab list. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'profile', title: 'Profile', component: ProfileSection },
  { id: 'notifications', title: 'Notifications', component: NotificationSection },
  { id: 'security', title: 'Security', component: SecuritySection },
  { id: 'business', title: 'Business', component: BusinessSection, permissions: ['settings.business'] },
  {
    id: 'integrations',
    title: 'Integrations',
    component: IntegrationSection,
    permissions: ['settings.integrations'],
  },
  { id: 'billing', title: 'Billing', component: BillingSection, permissions: ['settings.billing'] },
];

export interface SettingsPageProps {
  tenantId: string;
  /** Permissions held by the current user; sections are filtered against these. */
  userPermissions?: string[];
  sections?: SettingsSection[];
  /** Server-persisted values, keyed by section id. */
  initialValues?: Record<string, FieldValues>;
  /** Persists one section. Rejecting surfaces an error toast and keeps the draft. */
  onSaveSection?: (sectionId: string, data: unknown) => Promise<void>;
  initialSectionId?: string;
  className?: string;
}

const draftKey = (sectionId: string) => `settings-draft-${sectionId}`;
const DRAFT_DEBOUNCE_MS = 400;

/* localStorage is wrapped on every access: Safari private mode throws on write,
   and a corrupted blob must degrade to "no draft" rather than crash settings. */
function readDraft(sectionId: string): FieldValues | null {
  try {
    const raw = window.localStorage.getItem(draftKey(sectionId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as FieldValues) : null;
  } catch {
    return null;
  }
}

function writeDraft(sectionId: string, values: FieldValues): void {
  try {
    window.localStorage.setItem(draftKey(sectionId), JSON.stringify(values));
  } catch {
    /* drafts are a convenience, not a contract */
  }
}

function clearDraft(sectionId: string): void {
  try {
    window.localStorage.removeItem(draftKey(sectionId));
  } catch {
    /* nothing actionable */
  }
}

/**
 * settings-page: host for every settings section.
 *
 * Form architecture
 * - The *host* owns one `react-hook-form` instance and exposes it through
 *   `FormProvider`; sections call `useFormContext()` and `register()` their
 *   fields. react-hook-form is already a dependency, so this adds nothing to
 *   the bundle.
 * - That choice is what makes the shared action bar work. A Save button living
 *   outside the section can only be wired to the section's fields if the form
 *   state sits above both, and `formState.isDirty` then becomes the single
 *   source of truth for dirtiness — no per-section bookkeeping, no guessing
 *   from input events.
 * - Sections therefore render `<fieldset>`, never `<form>`: nested forms are
 *   invalid HTML and the inner one silently swallows submits.
 *
 * Drafts
 * - `watch()` feeds a debounced write to `settings-draft-${sectionId}`; the
 *   draft is cleared only after the server confirms, so a failed save loses
 *   nothing. On mount (and on every section switch) a draft is restored as the
 *   form's values, which leaves the form legitimately dirty.
 *
 * Unsaved-changes guard
 * - Switching sections with pending edits asks for confirmation;
 *   `beforeunload` covers a tab close and is registered only while dirty, so a
 *   clean navigation is never blocked.
 *
 * Error isolation
 * - Each panel sits in an error boundary, so one broken section degrades to a
 *   recoverable empty state instead of blanking the settings area.
 *
 * Accessibility
 * - Save results are announced by the Toast system (polite for success,
 *   assertive for errors, which also stay until dismissed so the reason cannot
 *   vanish after 5s).
 * - Focus moves into the panel on section change, so keyboard users land in the
 *   new content instead of at the top of the page.
 * - The Save button is `aria-busy` while in flight and disabled when clean.
 */
export function SettingsPage({
  tenantId,
  userPermissions = [],
  sections = SETTINGS_SECTIONS,
  initialValues,
  onSaveSection,
  initialSectionId,
  className = '',
}: SettingsPageProps) {
  const visibleSections = useMemo(
    () =>
      sections.filter(
        (section) =>
          !section.permissions?.length ||
          section.permissions.every((permission) => userPermissions.includes(permission)),
      ),
    [sections, userPermissions],
  );

  const [activeSectionId, setActiveSectionId] = useState(
    () => initialSectionId ?? visibleSections[0]?.id ?? '',
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<ToastItemProps[]>([]);

  const activeSection = visibleSections.find((section) => section.id === activeSectionId);

  const form = useForm<FieldValues>({
    // A restored draft wins over server values — it is the newer edit.
    defaultValues: readDraft(activeSectionId) ?? initialValues?.[activeSectionId] ?? {},
    mode: 'onBlur',
  });
  const isDirty = form.formState.isDirty;

  /* ---- toasts ---- */
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItemProps, 'id' | 'onDismiss'>) => {
      const id = `settings-toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current, { ...toast, id, onDismiss: dismissToast }]);
    },
    [dismissToast],
  );

  /* ---- debounced draft autosave ---- */
  useEffect(() => {
    if (!activeSectionId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const subscription = form.watch((values) => {
      // Only persist real edits; the initial emission is not a change.
      if (!form.formState.isDirty) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => writeDraft(activeSectionId, values), DRAFT_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [activeSectionId, form]);

  /* ---- reload values when the section changes ---- */
  useEffect(() => {
    form.reset(readDraft(activeSectionId) ?? initialValues?.[activeSectionId] ?? {}, {
      // A restored draft must still count as dirty, so the user can save it.
      keepDirty: Boolean(readDraft(activeSectionId)),
    });
  }, [activeSectionId, initialValues, form]);

  /* ---- unsaved-changes guard ---- */
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom text now; returnValue is still the opt-in.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  /* ---- section switching ---- */
  const panelRef = useRef<HTMLDivElement>(null);

  const handleSectionChange = useCallback(
    (sectionId: string) => {
      if (sectionId === activeSectionId) return;
      if (
        isDirty &&
        !window.confirm('You have unsaved changes in this section. Leave without saving?')
      ) {
        return;
      }
      setActiveSectionId(sectionId);
    },
    [activeSectionId, isDirty],
  );

  useEffect(() => {
    panelRef.current?.focus?.();
  }, [activeSectionId]);

  /* ---- save / reset ---- */
  const submit = form.handleSubmit(async (values) => {
    const sectionId = activeSectionId;
    setIsSaving(true);
    // Hold the draft until the server confirms.
    writeDraft(sectionId, values);

    try {
      await onSaveSection?.(sectionId, values);
      clearDraft(sectionId);
      // Re-baseline so the form is clean again without losing the new values.
      form.reset(values, { keepValues: true });
      pushToast({
        title: 'Settings saved',
        description: `${activeSection?.title ?? 'Section'} updated.`,
        variant: 'success',
        duration: 5000,
      });
    } catch (error) {
      pushToast({
        title: 'Could not save settings',
        description:
          error instanceof Error ? error.message : 'Something went wrong. Your draft is kept.',
        variant: 'error',
        duration: 0,
      });
    } finally {
      setIsSaving(false);
    }
  });

  const handleReset = useCallback(() => {
    clearDraft(activeSectionId);
    form.reset(initialValues?.[activeSectionId] ?? {});
    pushToast({ title: 'Changes discarded', variant: 'default', duration: 5000 });
  }, [activeSectionId, form, initialValues, pushToast]);

  /**
   * `onSave` is exposed to sections so a section can save itself (e.g. Security
   * runs its own password flow). It reuses the host pipeline, keeping drafts and
   * toasts consistent.
   */
  const sectionProps: SettingsSectionProps = useMemo(
    () => ({
      tenantId,
      onSave: async (data: unknown) => {
        await onSaveSection?.(activeSectionId, data);
      },
      onReset: handleReset,
      isDirty,
    }),
    [tenantId, onSaveSection, activeSectionId, handleReset, isDirty],
  );

  if (visibleSections.length === 0) {
    return (
      <EmptyState
        title="No settings available"
        description="Your account does not have permission to view any settings sections."
      />
    );
  }

  const ActiveComponent = activeSection?.component;
  const formId = `settings-form-${activeSectionId}`;

  return (
    <div className={cn('space-y-4', className)}>
      <h1 className="text-h2 text-[var(--color-text-primary)]">Settings</h1>

      <SettingsLayout
        sections={visibleSections}
        activeSectionId={activeSectionId}
        onSectionChange={handleSectionChange}
        isDirty={isDirty}
        isSheetOpen={isSheetOpen}
        onSheetOpenChange={setIsSheetOpen}
        actionBar={
          <>
            <button
              type="button"
              onClick={handleReset}
              disabled={!isDirty || isSaving}
              className={cn(
                'touch-target text-body-sm rounded-md px-4',
                'border border-[var(--border-default)] bg-[var(--surface-base)]',
                'text-[var(--color-text-primary)] hover:bg-[var(--state-hover)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Discard changes
            </button>
            {/* `form=` lets a button outside the <form> submit it — the whole
                reason form state lives in the host. */}
            <button
              type="submit"
              form={formId}
              disabled={!isDirty || isSaving}
              aria-busy={isSaving}
              className={cn(
                'touch-target text-body-sm rounded-md px-4 font-medium',
                'bg-[var(--color-primary)] text-[var(--color-on-primary)]',
                'hover:bg-[var(--color-primary-hover)]',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        <div ref={panelRef} tabIndex={-1}>
          <SettingsSectionBoundary sectionId={activeSectionId}>
            <FormProvider {...form}>
              <form id={formId} onSubmit={submit} noValidate>
                {ActiveComponent && <ActiveComponent key={activeSectionId} {...sectionProps} />}
              </form>
            </FormProvider>
          </SettingsSectionBoundary>
        </div>
      </SettingsLayout>

      <ToastContainer toasts={toasts} />
    </div>
  );
}

interface BoundaryProps {
  sectionId: string;
  children: React.ReactNode;
}

/**
 * Per-section error boundary. A class component because React still has no hook
 * equivalent of `componentDidCatch`.
 */
class SettingsSectionBoundary extends React.Component<BoundaryProps, { hasError: boolean }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previous: BoundaryProps) {
    // Switching sections clears a previous section's failure.
    if (previous.sectionId !== this.props.sectionId && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          title="This section could not be loaded"
          description="Try again, or pick a different settings section."
          action={{ label: 'Retry', onClick: () => this.setState({ hasError: false }) }}
        />
      );
    }
    return this.props.children;
  }
}

export default SettingsPage;
