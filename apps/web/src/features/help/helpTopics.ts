import { safeVertical, type VerticalId } from '@shared/index';

/**
 * In-app help guides (Admin → Help, /admin/help).
 *
 * Each guide is one task, written in en.json / he.json under `help.topics.<id>`
 * (title, summary, steps). `verticals` says which kinds of business it is for,
 * so a photographer never sees class-studio steps. `path` is the page the
 * guide's "Open this page" button goes to.
 *
 * These guides are also meant to be the only source the planned in-app
 * assistant answers from, so keep them short, factual and in step with the
 * screens: a PR that changes a flow updates its guide in both languages.
 */
export type HelpTopic = {
  id: string;
  verticals: readonly VerticalId[];
  path: string;
};

export const HELP_TOPICS: readonly HelpTopic[] = [
  { id: 'packages', verticals: ['photographer'], path: '/admin/bookings/packages' },
  { id: 'contract', verticals: ['photographer'], path: '/admin/settings/waivers' },
  { id: 'shoot_requests', verticals: ['photographer'], path: '/admin/bookings/diary' },
  { id: 'new_shoot', verticals: ['photographer'], path: '/admin/projects' },
  { id: 'quotes', verticals: ['photographer'], path: '/admin/projects/quotes' },
  { id: 'payments', verticals: ['photographer'], path: '/admin/projects' },
  { id: 'cancel_shoot', verticals: ['photographer'], path: '/admin/projects' },
  { id: 'smugmug', verticals: ['photographer'], path: '/admin/shop/photos' },
  { id: 'check_gallery', verticals: ['photographer'], path: '/admin/projects' },
  { id: 'send_gallery', verticals: ['photographer'], path: '/admin/projects' },
  { id: 'photo_prices', verticals: ['photographer'], path: '/admin/shop/photos' },
  { id: 'photo_orders', verticals: ['photographer'], path: '/admin/shop/photos' },
  { id: 'client_view', verticals: ['photographer'], path: '/admin/shop/photos' },
  { id: 'import_clients', verticals: ['photographer'], path: '/admin/people/import' },
  { id: 'automatic_emails', verticals: ['photographer'], path: '/admin/projects/quotes' },
];

/** The guides for one kind of business, in reading order. */
export function helpTopicsFor(vertical: string | null | undefined): HelpTopic[] {
  if (!vertical) return [];
  const id = safeVertical(vertical);
  return HELP_TOPICS.filter((topic) => topic.verticals.includes(id));
}
