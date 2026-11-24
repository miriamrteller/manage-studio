import { supabase } from '@/lib/supabase';

export interface RegisterStudent {
  person_id: string;
  name: string;
  /** Still enrolled (false: left the class but was marked on this date). */
  enrolled: boolean;
  /** true here, false not here, null not marked yet. */
  attended: boolean | null;
  /** The teacher's "cash collected" note for this date: waiting for the admin, or paid. */
  cash?: RegisterCash | null;
}

export interface RegisterCash {
  status: 'waiting' | 'paid';
  amount_minor: number | null;
  note: string | null;
}

export interface ClassRegisterData {
  runs: boolean;
  /** The class price, to prefill a cash amount (null when free or unknown). */
  price_minor?: number | null;
  currency?: string | null;
  students: RegisterStudent[];
}

export async function fetchClassRegister(offeringId: string, date: string): Promise<ClassRegisterData> {
  const { data, error } = await supabase.rpc('get_class_register', {
    p_offering_id: offeringId,
    p_session_date: date,
  });
  if (error) throw error;
  return data as unknown as ClassRegisterData;
}

/** Mark students here (true), not here (false), or clear the mark (null). */
export async function setClassAttendance(
  offeringId: string,
  date: string,
  personIds: string[],
  attended: boolean | null,
) {
  const { error } = await supabase.rpc('set_class_attendance', {
    p_offering_id: offeringId,
    p_session_date: date,
    p_person_ids: personIds,
    // The generated type says boolean; null clears the mark.
    p_attended: attended as boolean,
  });
  if (error) throw error;
}

/**
 * "Cash collected": the teacher notes that a pupil paid in cash for this date. It is
 * not a payment; it waits until the admin records the payment.
 */
export async function setCashCollected(
  offeringId: string,
  date: string,
  personId: string,
  amountMinor: number | null,
  note: string,
) {
  const { error } = await supabase.rpc('set_cash_collected', {
    p_offering_id: offeringId,
    p_session_date: date,
    p_person_id: personId,
    // The generated types say number / string; null leaves them empty.
    p_amount_minor: amountMinor as number,
    p_note: (note.trim() || null) as string,
  });
  if (error) throw error;
}

/** Take back a waiting "cash collected" note (tapped by mistake). */
export async function clearCashCollected(offeringId: string, date: string, personId: string) {
  const { error } = await supabase.rpc('clear_cash_collected', {
    p_offering_id: offeringId,
    p_session_date: date,
    p_person_id: personId,
  });
  if (error) throw error;
}

/** Today if the class runs today, otherwise the last day it ran (weekly classes), YYYY-MM-DD in studio time. */
export function lastSessionDate(dayOfWeek: number | null, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
  if (dayOfWeek == null) return today;
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() - dayOfWeek + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
