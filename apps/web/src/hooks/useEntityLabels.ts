import { useTenant } from './useTenant';
import {
  resolveEntityLabels,
  resolvePresetModules,
  type EntityLabels,
  type PresetModules,
  type BusinessPreset,
} from '@shared/index';

const FALLBACK_PRESET: BusinessPreset = 'programs';
const FALLBACK_LABELS: EntityLabels = resolveEntityLabels(FALLBACK_PRESET);
const FALLBACK_MODULES: PresetModules = resolvePresetModules(FALLBACK_PRESET);

export function useEntityLabels() {
  const tenant = useTenant();
  if (!tenant) {
    return {
      labels: FALLBACK_LABELS,
      modules: FALLBACK_MODULES,
      preset: FALLBACK_PRESET,
    };
  }
  return {
    labels: tenant.entity_labels,
    modules: tenant.modules,
    preset: tenant.business_preset,
  };
}
