import { useMemo } from 'react';
import { EXISTING_STUDIO_PROFILE } from '@shared/index';
import { useTenant } from '@/hooks/useTenant';
import { workModesOf, type WorkModes } from '@/features/settings/lib/workModes';

/**
 * The studio's answer to "How do clients work with you?" (Settings › Business): Classes (and
 * Parents pay for children), Projects, Appointments. Pages show or hide their parts from this,
 * never from the business type, the same way the menu does (owner, 13 Nov 2026).
 * Reads the same studio profile as the menu (tenant.profile); before the studio loads it reads
 * as an existing studio, as the menu does, so nothing flickers.
 */
export function useWorkModes(): WorkModes {
  const tenant = useTenant();
  const profile = tenant?.profile;
  return useMemo(() => workModesOf(profile ?? EXISTING_STUDIO_PROFILE), [profile]);
}
