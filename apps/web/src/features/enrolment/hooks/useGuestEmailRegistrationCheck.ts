import { useEffect, useState } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { EnrolmentIntakeService } from '../intakeService';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useGuestEmailRegistrationCheck(email: string, enabled: boolean) {
  const tenant = useTenant();
  const [registered, setRegistered] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (!enabled || !tenant) {
      setRegistered(false);
      setIsChecking(false);
      return;
    }

    const normalized = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      setRegistered(false);
      setIsChecking(false);
      return;
    }

    let cancelled = false;
    setIsChecking(true);

    const timer = window.setTimeout(async () => {
      try {
        const exists = await EnrolmentIntakeService.checkGuestEmailRegistered(tenant, normalized);
        if (!cancelled) {
          setRegistered(exists);
        }
      } catch {
        if (!cancelled) {
          setRegistered(false);
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

  return { registered, isChecking };
}
