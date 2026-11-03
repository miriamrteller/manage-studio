import { fireEvent, screen } from '@testing-library/react';

/**
 * Fills the "Signer details" block of the signing step (English UI) with valid values.
 * 123456782 passes the Israeli ID check digit. The child block is filled only when it is shown
 * and still empty (it is pre-filled from the student when the date of birth is known).
 */
const LABELS = {
  en: { id: 'ID number (teudat zehut)', phone: 'Phone number', address: 'Home address', childName: "Child's full name", childDob: "Child's date of birth", confirm: 'These details are correct' },
  he: { id: 'מספר תעודת זהות', phone: 'מספר טלפון', address: 'כתובת מגורים', childName: 'שם מלא של הילד/ה', childDob: 'תאריך לידה של הילד/ה', confirm: 'הפרטים נכונים' },
} as const;

export function fillSignerDetails(options: { childName?: string; childDob?: string; lang?: 'en' | 'he' } = {}) {
  const L = LABELS[options.lang ?? 'en'];
  fireEvent.change(screen.getByLabelText(L.id, { exact: false }), { target: { value: '123456782' } });
  fireEvent.change(screen.getByLabelText(L.phone), { target: { value: '050-123-4567' } });
  fireEvent.change(screen.getByLabelText(L.address), { target: { value: '1 Herzl St, Haifa' } });
  const childName = screen.queryByLabelText(L.childName) as HTMLInputElement | null;
  if (childName && !childName.value) {
    fireEvent.change(childName, { target: { value: options.childName ?? 'Student Name' } });
  }
  const childDob = screen.queryByLabelText(L.childDob) as HTMLInputElement | null;
  if (childDob && !childDob.value) {
    fireEvent.change(childDob, { target: { value: options.childDob ?? '2016-01-02' } });
  }
  fireEvent.click(screen.getByRole('checkbox', { name: L.confirm }));
}
