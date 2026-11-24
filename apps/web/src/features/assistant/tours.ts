import { HELP_TOPICS } from '@/features/help/helpTopics';

/**
 * Guided tours for "Show me how" (Ask OpalSwift). A tour walks a guide's own steps
 * (help.topics.<id>.steps) one by one: each step can open a page and highlight one
 * element marked with data-tour="<target>". A step with no target, or whose element
 * is not on the page (e.g. it is inside one shoot), shows its text in the middle.
 *
 * The tour only points: it never presses anything. The admin does every step.
 */
export interface TourStep {
  /** Page to open first (path and optional ?query). */
  path?: string;
  /** data-tour value of the element to highlight. */
  target?: string;
}

/** Extra detail per guide; step i lines up with help.topics.<id>.steps[i]. */
const TOUR_DETAIL: Record<string, TourStep[]> = {
  packages: [
    { path: '/admin/bookings/packages' },
    { path: '/admin/bookings/packages', target: 'packages-add' },
  ],
  new_shoot: [
    { path: '/admin/projects', target: 'shoots-new' },
    { target: 'shoot-client' },
    { target: 'shoot-package' },
    { target: 'shoot-create-quote' },
  ],
  shoot_requests: [{ path: '/admin/bookings/diary', target: 'diary-requests' }],
  smugmug: [
    { path: '/admin/shop/photos', target: 'photo-shop-tab-smugmug' },
    { path: '/admin/shop/photos?tab=smugmug' },
    { path: '/admin/shop/photos?tab=smugmug', target: 'smugmug-save' },
    { path: '/admin/shop/photos?tab=smugmug', target: 'smugmug-connect' },
  ],
  photo_prices: [{ path: '/admin/shop/photos', target: 'photo-shop-tab-prices' }],
  client_view: [{ path: '/admin/shop/photos', target: 'photo-shop-tab-preview' }],
  photo_orders: [{ path: '/admin/shop/photos', target: 'photo-shop-tab-orders' }],
  import_clients: [{ path: '/admin/people', target: 'people-import' }, { path: '/admin/people/import' }],
  automatic_emails: [{ path: '/admin/projects/quotes', target: 'quotes-automatic' }],
  send_gallery: [{ path: '/admin/projects' }],
  // Dance studios.
  seasons: [{ path: '/admin/classes/seasons' }, { path: '/admin/classes/seasons', target: 'seasons-add' }],
  new_class: [{ path: '/admin/classes', target: 'classes-add' }],
  teachers: [{ path: '/admin/classes/teachers', target: 'teachers-add' }],
  class_payments: [{ path: '/admin/finance/payments' }, { path: '/admin/finance/payments', target: 'payments-record' }],
};

/**
 * The tour for one guide, one entry per written step. The first step always opens
 * the guide's page, so every guide has a tour even without detail above.
 */
export function tourFor(guideId: string, stepCount: number): TourStep[] | null {
  const topic = HELP_TOPICS.find((x) => x.id === guideId);
  if (!topic || stepCount < 1) return null;
  const detail = TOUR_DETAIL[guideId] ?? [];
  return Array.from({ length: stepCount }, (_, i) => {
    const step = detail[i] ?? {};
    return i === 0 && !step.path ? { ...step, path: topic.path } : step;
  });
}

/** True when the browser is already on this step's page (path, and query when given). */
export function isOnPath(stepPath: string, current: { pathname: string; search: string }): boolean {
  const [path, query = ''] = stepPath.split('?');
  if (current.pathname !== path) return false;
  if (!query) return true;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(current.search);
  return [...want.entries()].every(([k, v]) => have.get(k) === v);
}
