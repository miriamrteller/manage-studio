/**
 * Automatic class emails to enrolled families (tenants.class_reminders):
 *  - the morning-of reminder: "class today at 4:30", with where and what to wear;
 *  - the no-class notice, a week ahead: "no class next Wednesday".
 *
 * Pure logic, no I/O: run-class-reminders loads the rows and sends. A day has
 * no class when it is a skipped Israeli holiday (the same rule as the
 * timetable) or one of the studio's own closed dates (e.g. Shushan Purim in
 * Jerusalem, or a day off). An explicit session row on a date is the admin's
 * choice and always counts as a class.
 */

export interface ClassRemindersConfig {
  morning: boolean;
  no_class: boolean;
  wear_en: string;
  wear_he: string;
  closed_dates: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEAR = 1000;
const MAX_CLOSED = 100;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseClassReminders(raw: unknown): ClassRemindersConfig {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const closed = Array.isArray(obj.closed_dates)
    ? [...new Set(obj.closed_dates.filter((d): d is string => typeof d === "string" && ISO_DATE.test(d)))].sort()
    : [];
  return {
    morning: obj.morning === true,
    no_class: obj.no_class === true,
    wear_en: text(obj.wear_en, MAX_WEAR),
    wear_he: text(obj.wear_he, MAX_WEAR),
    closed_dates: closed.slice(0, MAX_CLOSED),
  };
}

export interface ReminderOffering {
  id: string;
  name: string;
  /** 0 = Sunday ... 6 = Saturday. */
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  season_start: string | null;
  season_end: string | null;
}

export interface ReminderSession {
  offering_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
}

/** Day of week (0 = Sunday) of an ISO date. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function inSeason(o: ReminderOffering, date: string): boolean {
  if (o.season_start && date < o.season_start) return false;
  if (o.season_end && date > o.season_end) return false;
  return true;
}

export interface Occurrence {
  offering: ReminderOffering;
  start_time: string;
  end_time: string | null;
}

/**
 * The class's meeting on `date`, if it is a regular class day, plus whether
 * that day is off. An explicit session on the date is always a class.
 */
export function classOnDate(
  o: ReminderOffering,
  date: string,
  sessions: ReminderSession[],
  isOff: (date: string) => boolean,
): { occurrence: Occurrence; off: boolean } | null {
  const session = sessions.find((s) => s.offering_id === o.id && s.session_date === date);
  if (session) {
    return { occurrence: { offering: o, start_time: session.start_time, end_time: session.end_time }, off: false };
  }
  if (o.day_of_week === null || o.start_time === null) return null;
  if (weekdayOf(date) !== o.day_of_week || !inSeason(o, date)) return null;
  return { occurrence: { offering: o, start_time: o.start_time, end_time: o.end_time }, off: isOff(date) };
}

/** "16:30:00" -> "16:30" (Hebrew) or "4:30" (English, as Israeli parents say it for afternoon classes). */
export function formatTime(time: string, lang: "en" | "he"): string {
  const [h = "0", m = "00"] = time.split(":");
  const hour = Number(h);
  if (lang === "he") return `${String(hour).padStart(2, "0")}:${m}`;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m}`;
}

export function formatDay(isoDate: string, lang: "en" | "he"): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

function firstName(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

function greeting(name: string | null, lang: "en" | "he"): string {
  const first = firstName(name);
  if (lang === "he") return first ? `שלום ${first},` : "שלום,";
  return first ? `Hi ${first},` : "Hi,";
}

export interface ReminderEmailInput {
  lang: "en" | "he";
  parentName: string | null;
  studentName: string | null;
  className: string;
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  wear: string;
  studio: string;
}

export function morningReminderEmail(input: ReminderEmailInput): { subject: string; body: string } {
  const he = input.lang === "he";
  const time = formatTime(input.startTime, input.lang) +
    (input.endTime ? `–${formatTime(input.endTime, input.lang)}` : "");
  const who = firstName(input.studentName);
  const lines: string[] = [greeting(input.parentName, input.lang), ""];
  if (he) {
    lines.push(who ? `תזכורת: השיעור של ${who} (${input.className}) היום, ${time}.` : `תזכורת: השיעור (${input.className}) היום, ${time}.`);
  } else {
    lines.push(who ? `A reminder that ${who}'s class (${input.className}) is today at ${time}.` : `A reminder that ${input.className} is today at ${time}.`);
  }
  lines.push("");
  if (input.location) lines.push(`${he ? "איפה" : "Where"}: ${input.location}`);
  if (input.wear) lines.push(`${he ? "מה ללבוש" : "What to wear"}: ${input.wear}`);
  if (input.location || input.wear) lines.push("");
  lines.push(he ? "נתראה!" : "See you soon!", input.studio);
  return {
    subject: he
      ? `תזכורת: ${input.className} היום ב-${formatTime(input.startTime, "he")}`
      : `Reminder: ${input.className} today at ${formatTime(input.startTime, "en")}`,
    body: lines.join("\n"),
  };
}

export function noClassEmail(input: Omit<ReminderEmailInput, "startTime" | "endTime" | "location" | "wear">): {
  subject: string;
  body: string;
} {
  const he = input.lang === "he";
  const day = formatDay(input.date, input.lang);
  const lines = [
    greeting(input.parentName, input.lang),
    "",
    he
      ? `לידיעתכם, ב${day} אין שיעור (${input.className}).`
      : `Just so you know, there's no ${input.className} class on ${day}.`,
    "",
    input.studio,
  ];
  return {
    subject: he ? `אין שיעור ב${day}` : `No class on ${day}`,
    body: lines.join("\n"),
  };
}
