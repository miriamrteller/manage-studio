import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasParentRole } from '@/lib/parentRoles';

/** The client portal route (PortalDashboard renders ClientPortal for photographers). */
export const CLIENT_PORTAL_PATH = '/dashboard/portal';

/**
 * Where "Back to my bookings" goes: a signed-in client straight to the
 * portal; any other signed-in user (e.g. the studio previewing a link) to
 * their own dashboard; a guest to login, which returns to the portal.
 */
export function backToPortalTarget(roles: string[] | null | undefined): {
  to: string;
  state?: { from: string };
} {
  if (!roles) return { to: '/login', state: { from: CLIENT_PORTAL_PATH } };
  return { to: hasParentRole(roles) ? CLIENT_PORTAL_PATH : '/dashboard' };
}

/**
 * Way back to the client portal from the public pay / quote / contract
 * pages, so a client who finished an action isn't left on a dead end.
 */
export function BackToPortalButton({ variant = 'secondary' }: { variant?: ButtonProps['variant'] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const target = backToPortalTarget(user?.role ?? null);
  return (
    <Button
      type="button"
      variant={variant}
      fullWidth
      onClick={() => navigate(target.to, target.state ? { state: target.state } : undefined)}
    >
      {user ? t('pages.booking_flow.back_to_portal') : t('pages.booking_flow.back_to_portal_signin')}
    </Button>
  );
}
