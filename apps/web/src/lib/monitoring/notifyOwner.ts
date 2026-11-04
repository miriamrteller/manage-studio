import { supabase } from '@/lib/supabase';
import { scrubPath, scrubText } from './scrub';

/**
 * Also emails the platform owner (privately) when a studio admin sends a problem report.
 * Best effort: any failure is ignored, because the report itself has already gone to
 * Sentry and must never fail or slow down because of this email.
 */
export async function notifyOwnerOfProblemReport(message: string, eventId: string | null): Promise<void> {
  try {
    await supabase.functions.invoke('notify-problem-report', {
      body: {
        message: scrubText(message.trim()).slice(0, 2000),
        route: scrubPath(window.location.pathname),
        eventId,
      },
    });
  } catch {
    /* best effort */
  }
}
