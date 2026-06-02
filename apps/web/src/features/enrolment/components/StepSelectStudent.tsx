import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useEnrolmentStudentSearch } from '../hooks/useEnrolmentStudentSearch';
import { filterStudentCandidates, studentAgeLabel } from '../lib/filterStudentCandidates';
import type { EnrolmentSearchResult } from '../hooks/useEnrolmentStudentSearch';
import type { Person } from '@shared/schemas';
import type { EnrolmentConstraints, EnrolmentMode } from '../hooks/useEnrolmentContext';
import type { GuardianProfile } from '../onboardingService';
import type { StudentWithEnrolments } from '../hooks/useAccountStudents';

interface StudentSearchComboboxProps {
  onSelect: (person: Person) => void;
  constraints: EnrolmentConstraints;
  disabled?: boolean;
}

export function StudentSearchCombobox({
  onSelect,
  constraints,
  disabled = false,
}: StudentSearchComboboxProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { results, isSearching } = useEnrolmentStudentSearch(inputValue, isOpen && !disabled);

  const filteredResults = useMemo(() => {
    const people = results.map((r) => r.person);
    const { eligible, ineligible } = filterStudentCandidates(people, {
      accountId: constraints.accountId,
      ageBand: constraints.ageBand,
    });
    const eligibleIds = new Set(eligible.map((p) => p.id));
    return results.filter((r) => eligibleIds.has(r.person.id) || ineligible.some((i) => i.person.id === r.person.id));
  }, [results, constraints]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [filteredResults.length]);

  const handleSelect = (result: EnrolmentSearchResult) => {
    const { eligible } = filterStudentCandidates([result.person], {
      accountId: constraints.accountId,
      ageBand: constraints.ageBand,
    });
    if (eligible.length === 0) return;
    onSelect(result.person);
    setInputValue('');
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || filteredResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filteredResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const result = filteredResults[activeIndex];
      if (result) handleSelect(result);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t('pages.enrolment.admin_search_label')}
      </label>
      <input
        id={inputId}
        type="search"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        disabled={disabled}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t('pages.enrolment.admin_search_placeholder')}
        className="form-input w-full"
      />
      {isOpen && inputValue.trim() && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg"
        >
          {isSearching && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {t('common.loading')}
            </li>
          )}
          {!isSearching && filteredResults.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500" role="presentation">
              {t('pages.enrolment.admin_search_empty')}
            </li>
          )}
          {filteredResults.map((result, index) => {
            const age = studentAgeLabel(result.person.date_of_birth);
            const { eligible } = filterStudentCandidates([result.person], {
              accountId: constraints.accountId,
              ageBand: constraints.ageBand,
            });
            const isEligible = eligible.length > 0;
            return (
              <li key={result.person.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  disabled={!isEligible}
                  onClick={() => handleSelect(result)}
                  className={`w-full px-3 py-2 text-start text-sm ${
                    index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                  } ${!isEligible ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span className="block font-medium">{result.person.name}</span>
                  <span className="block text-xs text-gray-600">
                    {[
                      age ? t('pages.enrolment.student_age', { age }) : null,
                      result.accountName,
                      result.guardianName
                        ? t('pages.enrolment.guardian_summary', { name: result.guardianName })
                        : null,
                      result.guardianEmail,
                      result.activeClassNames.length > 0
                        ? t('pages.enrolment.enrolled_in', { classes: result.activeClassNames.join(', ') })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {!isEligible && constraints.ageBand && (
                    <span className="block text-xs text-amber-700">
                      {t('pages.enrolment.ineligible_age')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface StepSelectStudentProps {
  mode: EnrolmentMode;
  isAdultIntake?: boolean;
  constraints: EnrolmentConstraints;
  guardian: GuardianProfile | null;
  students: StudentWithEnrolments[];
  guardianPersonId: string | null;
  studentsLoading: boolean;
  studentsError: Error | null;
  onSelectPerson: (personId: string, dateOfBirth: string | null) => void;
  onCreateMinor: (fields: { student_name: string; student_date_of_birth: string }) => Promise<void>;
  onCreateAdult: (fields: {
    name: string;
    email?: string;
    phone?: string;
    date_of_birth?: string;
  }) => Promise<void>;
  onCreateMinorWithGuardian: (fields: {
    student_name: string;
    student_date_of_birth: string;
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

type SubMode = 'choose' | 'new_child' | 'new_adult' | 'new_family';

function initialSubMode(mode: EnrolmentMode, isAdultIntake: boolean): SubMode {
  if (mode === 'guest') {
    return isAdultIntake ? 'new_adult' : 'new_family';
  }
  return 'choose';
}

export function StepSelectStudent({
  mode,
  isAdultIntake = false,
  constraints,
  guardian,
  students,
  guardianPersonId,
  studentsLoading,
  studentsError,
  onSelectPerson,
  onCreateMinor,
  onCreateAdult,
  onCreateMinorWithGuardian,
  onCancel,
}: StepSelectStudentProps) {
  const { t } = useTranslation();
  const [subMode, setSubMode] = useState<SubMode>(() => initialSubMode(mode, isAdultIntake));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentDob, setStudentDob] = useState('');
  const [adultName, setAdultName] = useState('');
  const [adultEmail, setAdultEmail] = useState('');
  const [adultPhone, setAdultPhone] = useState('');
  const [adultDob, setAdultDob] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  const { eligible, ineligible } = useMemo(
    () => filterStudentCandidates(students, constraints, guardianPersonId),
    [students, constraints, guardianPersonId],
  );

  const ineligibleIds = useMemo(
    () => new Set(ineligible.map((item) => item.person.id)),
    [ineligible],
  );

  const needsGuardianForm = mode === 'guest' || mode === 'admin' || !guardian?.accountId;

  const handleSelect = (person: StudentWithEnrolments) => {
    if (ineligibleIds.has(person.id)) return;
    onSelectPerson(person.id, person.date_of_birth ?? null);
  };

  if (mode === 'admin' && subMode === 'choose') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{t('pages.enrolment.admin_select_desc')}</p>
        <StudentSearchCombobox
          constraints={constraints}
          onSelect={(person) => onSelectPerson(person.id, person.date_of_birth ?? null)}
        />
        <Button type="button" variant="outline" className="w-full" onClick={() => setSubMode('new_family')}>
          {t('pages.enrolment.create_new_student')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  if (subMode === 'new_family') {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setIsSubmitting(true);
          try {
            await onCreateMinorWithGuardian({
              student_name: studentName,
              student_date_of_birth: studentDob,
              guardian_name: guardianName,
              guardian_email: guardianEmail || undefined,
              guardian_phone: guardianPhone || undefined,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-gray-600">
          {mode === 'guest'
            ? t('pages.enrolment.guest_new_family_desc')
            : t('pages.enrolment.new_minor_desc')}
        </p>
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.guardian_section')}</legend>
          <input
            type="text"
            required
            className="form-input w-full"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            placeholder={t('form.person.name')}
          />
          <input
            type="email"
            required
            className="form-input w-full"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            placeholder={t('form.person.email')}
          />
          <input
            type="tel"
            className="form-input w-full"
            value={guardianPhone}
            onChange={(e) => setGuardianPhone(e.target.value)}
            placeholder={t('form.person.phone')}
          />
        </fieldset>
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
          <input type="text" required className="form-input w-full" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder={t('form.person.name')} />
          <input type="date" required className="form-input w-full" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {mode !== 'guest' && (
            <Button type="button" variant="outline" className="flex-1" onClick={() => setSubMode('choose')}>
              {t('common.back')}
            </Button>
          )}
          {mode === 'guest' && onCancel && (
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  if (subMode === 'new_adult') {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setIsSubmitting(true);
          try {
            await onCreateAdult({
              name: adultName,
              email: adultEmail || undefined,
              phone: adultPhone || undefined,
              date_of_birth: adultDob || undefined,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-gray-600">
          {mode === 'guest'
            ? t('pages.enrolment.guest_adult_desc')
            : t('pages.enrolment.new_adult_desc')}
        </p>
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.personal_section')}</legend>
          <input
            type="text"
            required
            className="form-input w-full"
            value={adultName}
            onChange={(e) => setAdultName(e.target.value)}
            placeholder={t('form.person.name')}
          />
          <input
            type="email"
            required={mode === 'guest'}
            className="form-input w-full"
            value={adultEmail}
            onChange={(e) => setAdultEmail(e.target.value)}
            placeholder={t('form.person.email')}
          />
          <input
            type="tel"
            className="form-input w-full"
            value={adultPhone}
            onChange={(e) => setAdultPhone(e.target.value)}
            placeholder={t('form.person.phone')}
          />
          <input
            type="date"
            className="form-input w-full"
            value={adultDob}
            onChange={(e) => setAdultDob(e.target.value)}
            placeholder={t('form.person.date_of_birth')}
          />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          {mode !== 'guest' && (
            <Button type="button" variant="outline" className="flex-1" onClick={() => setSubMode('choose')}>
              {t('common.back')}
            </Button>
          )}
          {mode === 'guest' && onCancel && (
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  if (subMode === 'new_child') {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setIsSubmitting(true);
          try {
            await onCreateMinor({ student_name: studentName, student_date_of_birth: studentDob });
          } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <p className="text-sm text-gray-600">{t('pages.enrolment.new_child_desc')}</p>
        {guardian && (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
            <p className="font-medium">{t('pages.enrolment.guardian_section')}</p>
            <p>{guardian.name}</p>
            {guardian.email && <p>{guardian.email}</p>}
            {guardian.phone && <p>{guardian.phone}</p>}
          </div>
        )}
        <fieldset className="border rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-1">{t('pages.enrolment.student_section')}</legend>
          <input type="text" required className="form-input w-full" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          <input type="date" required className="form-input w-full" value={studentDob} onChange={(e) => setStudentDob(e.target.value)} />
        </fieldset>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setSubMode('choose')}>
            {t('common.back')}
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={isSubmitting}>
            {isSubmitting ? t('common.loading') : t('common.next')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('pages.enrolment.select_student_desc')}</p>

      {studentsLoading && <p role="status">{t('common.loading')}</p>}
      {studentsError && (
        <p role="alert" className="text-sm text-red-600">
          {studentsError.message}
        </p>
      )}

      {!studentsLoading && mode === 'parent' && (
        <ul className="space-y-2" aria-label={t('pages.enrolment.select_student_desc')}>
          {eligible.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => handleSelect(student)}
                className="w-full rounded-lg border-2 border-blue-600 p-4 text-start hover:bg-blue-50 transition"
              >
                <span className="block font-medium">{student.name}</span>
                <span className="block text-sm text-gray-600">
                  {[
                    student.date_of_birth
                      ? t('pages.enrolment.student_age', {
                          age: studentAgeLabel(student.date_of_birth) ?? '—',
                        })
                      : null,
                    student.activeClassNames.length > 0
                      ? t('pages.enrolment.enrolled_in', { classes: student.activeClassNames.join(', ') })
                      : t('pages.enrolment.no_current_enrolments'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {ineligible.map(({ person, reason }) => (
            <li key={person.id}>
              <div className="w-full rounded-lg border border-gray-200 p-4 opacity-60">
                <span className="block font-medium">{person.name}</span>
                <span className="block text-xs text-amber-700">
                  {reason === 'age'
                    ? t('pages.enrolment.ineligible_age')
                    : t('pages.enrolment.ineligible_account')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {mode === 'parent' && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setSubMode(needsGuardianForm ? 'new_family' : 'new_child')}
        >
          {needsGuardianForm
            ? t('pages.enrolment.create_new_student')
            : t('pages.enrolment.add_new_child')}
        </Button>
      )}

      {mode === 'admin' && !isAdultIntake && (
        <>
          <Button type="button" variant="outline" className="w-full" onClick={() => setSubMode('new_adult')}>
            {t('pages.enrolment.person_new_adult')}
          </Button>
        </>
      )}

      {mode === 'admin' && isAdultIntake && (
        <Button type="button" variant="outline" className="w-full" onClick={() => setSubMode('new_adult')}>
          {t('pages.enrolment.create_new_adult')}
        </Button>
      )}

      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}
