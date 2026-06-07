import { useContext } from 'react';
import { LabelsContext, type LabelsContextType } from '@/contexts/LabelsContext';

/**
 * Returns resolved entity labels, module flags, and preset for the current tenant.
 *
 * Always returns valid data — falls back to 'programs' preset before tenant loads.
 * No null-checks needed at call sites.
 *
 * Usage:
 *   const { labels, modules, preset } = useEntityLabels();
 *   <h1>{labels.offering.plural}</h1>  // "Classes" for programs preset
 */
export function useEntityLabels(): LabelsContextType {
  return useContext(LabelsContext);
}
