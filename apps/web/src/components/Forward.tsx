import { Navigate, useLocation } from 'react-router-dom';

/**
 * Keeps an old address working after the URL rename (owner, 13 Nov 2026): swaps the old start of
 * the path for the new one and keeps the rest, the query and the hash, e.g.
 * /admin/people/abc?x=1 → /admin/people/abc?x=1. Bookmarks and links in sent emails keep working.
 */
export function Forward({ from, to }: { from: string; to: string }) {
  const { pathname, search, hash } = useLocation();
  const rest = pathname.startsWith(from) ? pathname.slice(from.length) : '';
  return <Navigate to={`${to}${rest}${search}${hash}`} replace />;
}
