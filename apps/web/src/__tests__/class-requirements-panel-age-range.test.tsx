// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import en from '@/i18n/en.json';
import { ClassRequirementsPanel } from '@/features/classes/requirements/components/ClassRequirementsPanel';

const h = vi.hoisted(() => ({
  updateClass: vi.fn(),
  linkTemplate: vi.fn(),
  createTemplate: vi.fn(),
  isUpdating: false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const raw = key.split('.').reduce<unknown>((n, p) => (n as Record<string, unknown> | undefined)?.[p], en);
      const text = typeof raw === 'string' ? raw : key;
      return text.replace(/\{\{(\w+)\}\}/g, (_m, name) => String(vars?.[name] ?? ''));
    },
  }),
}));

vi.mock('@/features/classes/requirements/hooks/useRequirements', () => ({
  useRequirements: () => ({
    requirements: [],
    isLoading: false,
    error: null,
    linkTemplate: h.linkTemplate,
    deleteRequirement: vi.fn(),
    isLinking: false,
    isDeleting: false,
  }),
  useRequirementTemplates: () => ({
    templates: [],
    isLoading: false,
    createTemplate: h.createTemplate,
    isCreating: false,
  }),
}));

vi.mock('@/features/levels/hooks/useLevels', () => ({
  useLevels: () => ({ levels: [], isLoading: false, createLevel: vi.fn(), isCreating: false }),
}));

vi.mock('@/features/classes/hooks/useClasses', () => ({
  useClasses: () => ({ updateClass: h.updateClass, isUpdating: h.isUpdating }),
}));

async function openAgeRange(props: { minAge?: number | null; maxAge?: number | null } = {}) {
  const user = userEvent.setup();
  render(<ClassRequirementsPanel classId="class-1" className="Ballet" {...props} />);
  await user.click(screen.getByRole('button', { name: new RegExp(en.form.requirement.add_button) }));
  await user.click(screen.getByRole('button', { name: en.form.requirement.create_and_link_button }));
  await user.selectOptions(screen.getAllByRole('combobox')[0], 'age_range');
  return user;
}

const minInput = () => screen.getByRole('textbox', { name: en.form.requirement.min_age }) as HTMLInputElement;
const maxInput = () => screen.getByRole('textbox', { name: en.form.requirement.max_age }) as HTMLInputElement;
const save = () => screen.getByRole('button', { name: en.form.requirement.age_save });

describe('ClassRequirementsPanel: Age range', () => {
  beforeEach(() => {
    h.updateClass.mockReset();
    h.linkTemplate.mockReset();
    h.createTemplate.mockReset();
    h.isUpdating = false;
  });

  it('offers "Age range" in the type list', async () => {
    await openAgeRange();
    expect(screen.getByRole('option', { name: en.form.requirement.type_age_range })).toBeTruthy();
  });

  it('shows the class ages that are already set, in the inputs and as text', async () => {
    await openAgeRange({ minAge: 5, maxAge: 9 });
    expect(minInput().value).toBe('5');
    expect(maxInput().value).toBe('9');
    expect(screen.getByTestId('age-current').textContent).toBe('Currently 5–9 years');
  });

  it('says so when no ages are set', async () => {
    await openAgeRange({ minAge: null, maxAge: null });
    expect(screen.getByTestId('age-current').textContent).toBe(en.form.requirement.age_current_none);
    expect(minInput().value).toBe('');
  });

  it('hides the requirement fields: no name, no hard block, no Create & link', async () => {
    await openAgeRange();
    expect(screen.queryByText(en.form.requirement.is_hard_block)).toBeNull();
    // only the mode-toggle button carries this label now, not a submit button
    expect(screen.getAllByRole('button', { name: en.form.requirement.create_and_link_button })).toHaveLength(1);
  });

  it('saves the ages on the class (not as a requirement) and confirms', async () => {
    h.updateClass.mockImplementation((_data, cb) => cb.onSuccess({}));
    const user = await openAgeRange({ minAge: 5, maxAge: 9 });
    await user.clear(minInput());
    await user.type(minInput(), '6');
    await user.clear(maxInput());
    await user.type(maxInput(), '12');
    await user.click(save());

    expect(h.updateClass).toHaveBeenCalledWith({ id: 'class-1', min_age: 6, max_age: 12 }, expect.any(Object));
    expect(h.createTemplate).not.toHaveBeenCalled();
    expect(h.linkTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(en.form.requirement.age_saved);
    expect(screen.getByTestId('age-current').textContent).toBe('Currently 6–12 years');
  });

  it('saves a cleared field as no limit', async () => {
    h.updateClass.mockImplementation((_data, cb) => cb.onSuccess({}));
    const user = await openAgeRange({ minAge: 5, maxAge: 9 });
    await user.clear(maxInput());
    await user.click(save());
    expect(h.updateClass).toHaveBeenCalledWith({ id: 'class-1', min_age: 5, max_age: null }, expect.any(Object));
  });

  it('rejects minimum above maximum with an announced error and focus on the field', async () => {
    const user = await openAgeRange();
    await user.type(minInput(), '10');
    await user.type(maxInput(), '4');
    await user.click(save());
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(en.form.requirement.age_order_invalid);
    expect(maxInput().getAttribute('aria-invalid')).toBe('true');
    expect(maxInput().getAttribute('aria-describedby')).toBe(alert.id);
    expect(document.activeElement).toBe(maxInput());
    expect(h.updateClass).not.toHaveBeenCalled();
  });

  it.each(['-1', '4.5', 'abc', '1e2'])('rejects %s as a minimum age', async (value) => {
    const user = await openAgeRange();
    await user.type(minInput(), value);
    await user.click(save());
    expect(screen.getByRole('alert').textContent).toBe(en.form.requirement.age_min_invalid);
    expect(minInput().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(minInput());
    expect(h.updateClass).not.toHaveBeenCalled();
  });

  it('accepts equal minimum and maximum, and 0', async () => {
    h.updateClass.mockImplementation((_data, cb) => cb.onSuccess({}));
    const user = await openAgeRange();
    await user.type(minInput(), '0');
    await user.type(maxInput(), '0');
    await user.click(save());
    expect(h.updateClass).toHaveBeenCalledWith({ id: 'class-1', min_age: 0, max_age: 0 }, expect.any(Object));
  });

  it('announces a save failure and keeps what was typed', async () => {
    h.updateClass.mockImplementation((_data, cb) => cb.onError(new Error('permission denied')));
    const user = await openAgeRange();
    await user.type(minInput(), '7');
    await user.click(save());
    expect(screen.getByRole('alert').textContent).toBe('permission denied');
    expect(minInput().value).toBe('7');
  });

  it('switching back to a real requirement type brings the requirement fields back', async () => {
    const user = await openAgeRange();
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'gender');
    expect(screen.getByText(en.form.requirement.is_hard_block)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: en.form.requirement.min_age })).toBeNull();
  });
});
