import type { JobRow } from '../services/jobService';

/**
 * Send gallery only where there is something to send (owner, 24 Nov 2026: every screen
 * self-explanatory). An enquiry or a booked shoot with no gallery yet shows a dash
 * instead of a button that could only answer "no gallery".
 */
export function hasGalleryToSend(job: JobRow, galleryName: string | null): boolean {
  if (job.job_status === 'cancelled') return false;
  if (job.gallery_url || galleryName) return true;
  return job.job_status === 'shot' || job.job_status === 'editing' || job.job_status === 'delivered';
}
