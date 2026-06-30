import type { EngagementWithOffering } from '@/components/Dashboard/useParentPortal';

export interface UpcomingSessionOccurrence {
  engagementId: string;
  personId: string;
  personName: string;
  className: string;
  occursAt: Date;
  classLocation?: string | null;
}

export const UPCOMING_SESSION_STATUSES = ['active', 'pending_payment', 'pending_waiver'] as const;

function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function parseLocalTimeOnDate(calendarDate: Date, startTime: string): Date {
  const [hours, minutes, seconds = '0'] = startTime.split(':');
  const result = new Date(calendarDate);
  result.setHours(Number(hours), Number(minutes), Number(seconds), 0);
  return result;
}

function isLocalDateWithinHorizon(date: Date, startOfToday: Date, horizonLastDate: Date): boolean {
  const dateOnly = startOfLocalDay(date);
  return dateOnly >= startOfToday && dateOnly <= horizonLastDate;
}

/** Next weekly occurrence on/after fromDate; null if local calendar date falls outside horizon. */
export function nextOccurrenceOnOrAfter(
  classDay: number,
  startTime: string,
  fromDate: Date,
  horizonDays: number = 7,
): Date | null {
  const startOfToday = startOfLocalDay(fromDate);
  const horizonLastDate = new Date(startOfToday);
  horizonLastDate.setDate(horizonLastDate.getDate() + (horizonDays - 1));

  if (fromDate.getDay() === classDay) {
    const todayOccurrence = parseLocalTimeOnDate(fromDate, startTime);
    if (todayOccurrence >= fromDate && isLocalDateWithinHorizon(todayOccurrence, startOfToday, horizonLastDate)) {
      return todayOccurrence;
    }
  }

  const candidate = new Date(startOfToday);
  candidate.setDate(candidate.getDate() + 1);

  while (candidate <= horizonLastDate) {
    if (candidate.getDay() === classDay) {
      const occursAt = parseLocalTimeOnDate(candidate, startTime);
      if (occursAt >= fromDate && isLocalDateWithinHorizon(occursAt, startOfToday, horizonLastDate)) {
        return occursAt;
      }
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
}

/** Flatten enrolmentsByPerson → filter → map → sort by occursAt ascending. */
export function buildUpcomingSessions(
  enrolmentsByPerson: Record<string, EngagementWithOffering[]>,
  personNames: Record<string, string>,
  options?: { fromDate?: Date; horizonDays?: number },
): UpcomingSessionOccurrence[] {
  const fromDate = options?.fromDate ?? new Date();
  const horizonDays = options?.horizonDays ?? 7;
  const sessions: UpcomingSessionOccurrence[] = [];

  for (const [personId, enrolments] of Object.entries(enrolmentsByPerson)) {
    for (const enrolment of enrolments) {
      if (!UPCOMING_SESSION_STATUSES.includes(enrolment.status as (typeof UPCOMING_SESSION_STATUSES)[number])) {
        continue;
      }
      if (enrolment.classDay == null || !enrolment.classStartTime) {
        continue;
      }

      const occursAt = nextOccurrenceOnOrAfter(
        enrolment.classDay,
        enrolment.classStartTime,
        fromDate,
        horizonDays,
      );
      if (!occursAt) continue;

      sessions.push({
        engagementId: enrolment.id,
        personId,
        personName: personNames[personId] ?? personId,
        className: enrolment.className ?? enrolment.offering_id,
        occursAt,
        classLocation: enrolment.classLocation,
      });
    }
  }

  return sessions.sort((a, b) => a.occursAt.getTime() - b.occursAt.getTime());
}
