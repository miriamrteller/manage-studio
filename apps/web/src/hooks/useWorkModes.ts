import { useMemo } from 'react';
import { EXISTING_STUDIO_PROFILE } from '@shared/index';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { workModesOf, type WorkModes } from '@/features/settings/lib/workModes';

/**
 * The studio's answer to "How do clients work with you?" (Settings › Business): Classes (and
 * Parents pay for children), Projects, Appointments. Pages show or hide their parts from this,
 * never from the business type, the same way the menu does (owner, 13 Nov 2026).
 */
export function useWorkModes(): WorkModes {
  const { profile } = useEntityLabels();
  // Before the studio loads (or in a context without a profile) read as an existing studio, as the menu does.
  return useMemo(() => workModesOf(profile ?? EXISTING_STUDIO_PROFILE), [profile]);
}
