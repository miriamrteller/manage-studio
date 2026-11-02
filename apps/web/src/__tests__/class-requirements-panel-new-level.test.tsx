// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import en from '@/i18n/en.json';
import { ClassRequirementsPanel } from '@/features/classes/requirements/components/ClassRequirementsPanel';

const h = vi.hoisted(() => ({
  levels: [] as Array<{ id: string; name: string }>,
  createLevel: vi.fn(),
  isCreating: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en) ?? key,
  }),
}));

vi.mock('@/features/classes/requirements/hooks/useRequirements', () => ({
  useRequirements: () => ({
    requirements: [],
    isLoading: false,
    error: null,
    linkTemplate: vi.fn(),
    deleteRequirement: vi.fn(),
    isLinking: false,
    isDeleting: false,
  }),
  useRequirementTemplates: () => ({
    templates: [],
    isLoading: false,
    createTemplate: vi.fn(),
    isCreating: false,
  }),
}));

vi.mock('@/features/levels/hooks/useLevels', () => ({
  useLevels: () => ({
    levels: h.levels,
    isLoading: false,
    createLevel: h.createLevel,
    isCreating: h.isCreating,
  }),
}));

vi.mock('@/features/classes/hooks/useClasses', () => ({
  useClasses: () => ({ updateClass: vi.fn(), isUpdating: false }),
}));

async function openLevelForm() {
  const user = userEvent.setup();
  render(<ClassRequirementsPanel classId="c1" className="Ballet" />);
  await user.click(screen.getByRole('button', { name: new RegExp(en.form.requirement.add_button) }));
  await user.click(screen.getByRole('button', { name: en.form.requirement.create_and_link_button }));
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'level');
  return user;
}

describe('ClassRequirementsPanel: "+ New level"', () => {
  beforeEach(() => {
    h.levels = [];
    h.isCreating = false;
    h.createLevel.mockReset();
  });

  it('always offers "+ New level" and says "No levels yet" when there are none', async () => {
    await openLevelForm();
    const select = screen.getByRole('combobox', { name: en.form.requirement.level_id });
    expect(screen.getByRole('option', { name: en.form.requirement.new_level })).toBeTruthy();
    expect(screen.getByText(en.form.requirement.no_levels)).toBeTruthy();
    expect(select.getAttribute('aria-describedby')).toBe('requirement-no-levels');
  });

  it('keeps "+ New level" and hides the empty message when levels exist', async () => {
    h.levels = [{ id: 'l1', name: 'Beginner' }];
    await openLevelForm();
    expect(screen.getByRole('option', { name: 'Beginner' })).toBeTruthy();
    expect(screen.getByRole('option', { name: en.form.requirement.new_level })).toBeTruthy();
    expect(screen.queryByText(en.form.requirement.no_levels)).toBeNull();
  });

  it('moves focus to a labelled name field when "+ New level" is chosen', async () => {
    const user = await openLevelForm();
    await user.selectOptions(
      screen.getByRole('combobox', { name: en.form.requirement.level_id }),
      screen.getByRole('option', { name: en.form.requirement.new_level }),
    );
    const input = screen.getByRole('textbox', { name: en.form.requirement.new_level_name });
    expect(document.activeElement).toBe(input);
  });

  it('announces an error when saving an empty name, and does not create', async () => {
    const user = await openLevelForm();
    await user.selectOptions(
      screen.getByRole('combobox', { name: en.form.requirement.level_id }),
      screen.getByRole('option', { name: en.form.requirement.new_level }),
    );
    await user.click(screen.getByRole('button', { name: en.common.save }));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(en.form.requirement.new_level_name_required);
    expect(h.createLevel).not.toHaveBeenCalled();
    const input = screen.getByRole('textbox', { name: en.form.requirement.new_level_name });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('creates the level with the existing path, selects it and returns focus to the dropdown', async () => {
    h.createLevel.mockImplementation((_level, cb) => cb.onSuccess({ id: 'new-1', name: 'Pointe' }));
    const user = await openLevelForm();
    await user.selectOptions(
      screen.getByRole('combobox', { name: en.form.requirement.level_id }),
      screen.getByRole('option', { name: en.form.requirement.new_level }),
    );
    await user.type(screen.getByRole('textbox', { name: en.form.requirement.new_level_name }), '  Pointe ');
    await user.click(screen.getByRole('button', { name: en.common.save }));

    expect(h.createLevel).toHaveBeenCalledWith({ name: 'Pointe' }, expect.any(Object));
    const select = screen.getByRole('combobox', { name: en.form.requirement.level_id }) as HTMLSelectElement;
    expect(select.value).toBe('new-1');
    expect(screen.getByRole('option', { name: 'Pointe' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: en.form.requirement.new_level_name })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(select));
  });

  it('shows the failure as an alert and keeps the typed name', async () => {
    h.createLevel.mockImplementation((_level, cb) => cb.onError(new Error('duplicate level')));
    const user = await openLevelForm();
    await user.selectOptions(
      screen.getByRole('combobox', { name: en.form.requirement.level_id }),
      screen.getByRole('option', { name: en.form.requirement.new_level }),
    );
    await user.type(screen.getByRole('textbox', { name: en.form.requirement.new_level_name }), 'Pointe');
    await user.click(screen.getByRole('button', { name: en.common.save }));
    expect(screen.getByRole('alert').textContent).toBe('duplicate level');
    expect((screen.getByRole('textbox', { name: en.form.requirement.new_level_name }) as HTMLInputElement).value).toBe('Pointe');
  });

  it('Cancel closes the name field and returns focus to the dropdown', async () => {
    const user = await openLevelForm();
    const select = screen.getByRole('combobox', { name: en.form.requirement.level_id });
    await user.selectOptions(select, screen.getByRole('option', { name: en.form.requirement.new_level }));
    await user.click(screen.getAllByRole('button', { name: en.common.cancel }).at(-1)!);
    expect(screen.queryByRole('textbox', { name: en.form.requirement.new_level_name })).toBeNull();
    expect(document.activeElement).toBe(select);
  });
});
