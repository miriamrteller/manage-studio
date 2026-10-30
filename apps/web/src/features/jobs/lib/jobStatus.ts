import type { JobStatus } from '../services/jobService';

/** Badge classes per status (same palette the appointments page uses). */
export const JOB_STATUS_BADGE: Record<JobStatus, string> = {
  enquiry: 'bg-gray-100 text-gray-700',
  booked: 'bg-primary text-on-primary',
  shot: 'bg-blue-100 text-blue-800',
  editing: 'bg-amber-100 text-amber-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-500 line-through',
};

export function jobStatusKey(status: JobStatus): string {
  return `pages.jobs.status_${status}`;
}

/** Local datetime-input value ("YYYY-MM-DDTHH:mm") for an ISO timestamp, in the browser zone. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO timestamp (with offset) for a datetime-input value; null when empty/invalid. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
