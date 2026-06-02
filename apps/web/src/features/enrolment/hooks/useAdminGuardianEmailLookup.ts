import { useEffect, useState } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { EnrolmentOnboardingService } from '../onboardingService';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useAdminGuardianEmailLookup(email: string, enabled: boolean) {
  const tenant = useTenant();
  const [existingFamily, setExistingFamily] = useState<Awaited<
    ReturnType<typeof EnrolmentOnboardingService.lookupGuardianAccountByEmail>
  > | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!enabled || !tenant) {
      setExistingFamily(null);
      setIsChecking(false);
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      setExistingFamily(null);
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    const timer = window.setTimeout(async () => {
      try {
        const lookup = await EnrolmentOnboardingService.lookupGuardianAccountByEmail(
          tenant,
          normalized,
        );
        if (!cancelled) {
          setExistingFamily(lookup);
        }
      } catch {
        if (!cancelled) {
          setExistingFamily(null);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, enabled, tenant]);

  return { existingFamily, isChecking };
}
