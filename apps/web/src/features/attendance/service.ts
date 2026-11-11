import { supabase } from '@/lib/supabase';

export interface RegisterStudent {
  person_id: string;
  name: string;
  /** Still enrolled (false: left the class but was marked on this date). */
  enrolled: boolean;
  /** true here, false not here, null not marked yet. */
  attended: boolean | null;
}

export interface ClassRegisterData {
  runs: boolean;
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

/** Today if the class runs today, otherwise the last day it ran (weekly classes), YYYY-MM-DD in studio time. */
export function lastSessionDate(dayOfWeek: number | null, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
  if (dayOfWeek == null) return today;
  const d = new Date(`${today}T12:00:00Z`);
  const back = (d.getUTCDay() - dayOfWeek + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
