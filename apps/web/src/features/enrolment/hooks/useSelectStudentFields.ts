import { useState } from 'react';

/**
 * The typed-in values of the "who is enrolling" step (new student, new adult,
 * guardian). Kept in one place so they survive moving between sub-screens.
 */
export function useSelectStudentFields() {
  const [studentName, setStudentName] = useState('');
  const [studentDob, setStudentDob] = useState('');
  const [adultName, setAdultName] = useState('');
  const [adultEmail, setAdultEmail] = useState('');
  const [adultPhone, setAdultPhone] = useState('');
  const [adultDob, setAdultDob] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

  return {
    studentName,
    setStudentName,
    studentDob,
    setStudentDob,
    adultName,
    setAdultName,
    adultEmail,
    setAdultEmail,
    adultPhone,
    setAdultPhone,
    adultDob,
    setAdultDob,
    guardianName,
    setGuardianName,
    guardianEmail,
    setGuardianEmail,
    guardianPhone,
    setGuardianPhone,
  };
}

export type SelectStudentFields = ReturnType<typeof useSelectStudentFields>;
