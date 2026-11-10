import { supabase } from '../../../lib/supabase';

export const FEEDBACK_STATUSES = ['new', 'planned', 'done', 'not_doing'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** One "Send feedback" message, as the platform owner sees it on Platform > Feedback. */
export interface FeedbackItem {
  id: string;
  kind: 'bug' | 'idea' | 'help';
  message: string;
  route: string | null;
  screenshot_path: string | null;
  status: FeedbackStatus;
  created_at: string;
  studio_name: string;
  subdomain: string;
  /** The studio's industry (its skin's display name). */
  industry: string | null;
  /** Login email of the admin who sent it, so the owner can reply. */
  sender_email: string | null;
}

type Row = {
  id: string;
  kind: FeedbackItem['kind'];
  message: string;
  route: string | null;
  screenshot_path: string | null;
  status: FeedbackStatus;
  created_at: string;
  tenants: { name: string; subdomain: string; skin: string; verticals: { display_name: string } | null } | null;
  user_profiles: { email: string | null } | null;
};

/** Newest first. Only the platform owner can read these (database rules). */
export async function fetchFeedback(): Promise<FeedbackItem[]> {
  const { data, error } = await supabase
    .from('studio_feedback')
    .select(
      'id, kind, message, route, screenshot_path, status, created_at, tenants(name, subdomain, skin, verticals(display_name)), user_profiles(email)',
    )
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`Failed to fetch feedback: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    message: r.message,
    route: r.route,
    screenshot_path: r.screenshot_path,
    status: r.status,
    created_at: r.created_at,
    studio_name: r.tenants?.name ?? '',
    subdomain: r.tenants?.subdomain ?? '',
    industry: r.tenants?.verticals?.display_name ?? r.tenants?.skin ?? null,
    sender_email: r.user_profiles?.email ?? null,
  }));
}

export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const { error } = await supabase.from('studio_feedback').update({ status }).eq('id', id);
  if (error) throw new Error(`Failed to change status: ${error.message}`);
}

/** A link to the private screenshot that works for one minute. */
export async function screenshotUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('feedback-screenshots').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error('Failed to open screenshot');
  return data.signedUrl;
}
