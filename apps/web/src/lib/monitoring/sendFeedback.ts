import { supabase } from '@/lib/supabase';
import { checkScreenshot, isMonitoringEnabled, sendProblemReport } from './index';
import { scrubPath, scrubText } from './scrub';

/** What a studio admin is sending: something broken, an idea, or a request for help. */
export const FEEDBACK_KINDS = ['bug', 'idea', 'help'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Private bucket, one folder per studio. Only the platform owner can read it. */
export const FEEDBACK_SCREENSHOT_BUCKET = 'feedback-screenshots';

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/**
 * Uploads the screenshot to the studio's own folder under a random name (the picked
 * file's name is never used: it can carry people's names). Null when it fails: the
 * message still goes, just without the picture.
 */
async function uploadScreenshot(tenantId: string, file: File): Promise<string | null> {
  if ((await checkScreenshot(file)) !== null) return null;
  const path = `${tenantId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
  const { error } = await supabase.storage
    .from(FEEDBACK_SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : path;
}

/**
 * Sends "Send feedback". It is saved for the platform owner (Platform > Feedback) and
 * emailed to her. A bug also goes to Sentry, with the screenshot, so the Error fixer
 * picks it up; ideas and help requests do not. True when at least one of these took it.
 */
export async function sendFeedback(input: {
  kind: FeedbackKind;
  message: string;
  screenshot?: File | null;
  tenantId: string;
}): Promise<boolean> {
  const message = scrubText(input.message.trim()).slice(0, 2000);
  if (!message) return false;

  const eventId =
    input.kind === 'bug' && isMonitoringEnabled() ? await sendProblemReport(message, input.screenshot) : null;
  const screenshotPath = input.screenshot ? await uploadScreenshot(input.tenantId, input.screenshot) : null;

  let saved = false;
  try {
    const { data, error } = await supabase.functions.invoke('notify-problem-report', {
      body: {
        kind: input.kind,
        message,
        route: scrubPath(window.location.pathname),
        eventId,
        screenshotPath,
      },
    });
    saved = !error && (data as { ok?: boolean } | null)?.ok === true;
  } catch {
    saved = false;
  }
  return saved || !!eventId;
}
