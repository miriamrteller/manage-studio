/**
 * Client contact for a job's payment panel. The phone lives in
 * contact_preferences.whatsapp_number (Thread A moved it out of
 * people.emergency_contact_phone); PostgREST may embed the preference row as
 * an object or a one-element array depending on the relationship shape.
 */
export const JOB_CONTACT_SELECT =
  'booked_starts_at, people:person_id(contact_preferences(whatsapp_number))';

export interface JobContact {
  bookedStartsAt: string | null;
  phone: string | null;
}

type PrefsEmbed = { whatsapp_number?: string | null } | { whatsapp_number?: string | null }[] | null | undefined;

export interface JobContactRow {
  booked_starts_at?: string | null;
  people?: { contact_preferences?: PrefsEmbed } | { contact_preferences?: PrefsEmbed }[] | null;
}

export function jobContactFromRow(row: JobContactRow | null | undefined): JobContact {
  const person = Array.isArray(row?.people) ? row?.people[0] : row?.people;
  const prefsEmbed = person?.contact_preferences;
  const prefs = Array.isArray(prefsEmbed) ? prefsEmbed[0] : prefsEmbed;
  const phone = prefs?.whatsapp_number?.trim() || null;
  return { bookedStartsAt: row?.booked_starts_at ?? null, phone };
}
