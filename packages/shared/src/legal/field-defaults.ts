/**
 * What a studio's field (its skin) means for the forms its clients sign:
 * whether they sign a health declaration, and which add-on its agreement has.
 *
 * A skin row can say both (verticals.default_switches.health_declaration and
 * verticals.legal_addon). Built-in skins keep today's rules. A data skin that
 * says nothing is read from its id and names: sport and movement fields sign a
 * health declaration; tutors, coaches and therapists get the coaching add-on.
 */
import { defaultHealthDeclarations, isSignedAddon, type SignedAddon } from './signed-template.js';

const BUILT_IN = ['dance-studio', 'photographer', 'beautician', 'generic'];
const BUILT_IN_ADDONS: Record<string, SignedAddon> = { photographer: 'photographer', beautician: 'beautician' };

/** Sport and movement: dance, fitness and trainers, yoga and pilates, swimming, martial arts. */
const HEALTH_WORDS = [
  'dance', 'ballet', 'fitness', 'trainer', 'training', 'gym', 'yoga', 'pilates', 'swim', 'martial',
  'karate', 'judo', 'taekwondo', 'kickbox', 'boxing', 'krav', 'aikido', 'jiu',
  'ריקוד', 'מחול', 'בלט', 'כושר', 'מאמן כושר', 'יוגה', 'פילאטיס', 'שחי', 'לחימה', 'קרטה', "ג'ודו", 'גודו', 'טאקוונדו', 'אגרוף', 'קרב מגע',
];
/** Tutors, coaches and therapists. */
const COACHING_WORDS = ['tutor', 'coach', 'therap', 'מורה פרטי', 'שיעורים פרטיים', 'מאמן', 'מאמנת', 'מטפל', 'טיפול רגשי', 'קואצ'];

/** The parts of a skin this reads (a parsed skin row, or just its id). */
export interface FieldSkin {
  id: string | null | undefined;
  nameEn?: string | null;
  nameHe?: string | null;
  /** default_switches.health_declaration */
  healthDeclaration?: boolean | null;
  /** legal_addon */
  legalAddon?: string | null;
}

function words(skin: FieldSkin): string {
  return [skin.id, skin.nameEn, skin.nameHe].filter(Boolean).join(' ').toLowerCase();
}

function mentions(skin: FieldSkin, list: string[]): boolean {
  const text = words(skin);
  return list.some((w) => text.includes(w));
}

/** Whether a new studio in this field has "Clients sign a health declaration" on. */
export function fieldHealthDeclarations(skin: FieldSkin): boolean {
  if (typeof skin.healthDeclaration === 'boolean') return skin.healthDeclaration;
  if (BUILT_IN.includes(skin.id ?? '')) return defaultHealthDeclarations(skin.id);
  return mentions(skin, HEALTH_WORDS);
}

/** The add-on this field's agreement carries, if any. */
export function fieldLegalAddon(skin: FieldSkin): SignedAddon | null {
  if (BUILT_IN.includes(skin.id ?? '')) return BUILT_IN_ADDONS[skin.id ?? ''] ?? null;
  if (isSignedAddon(skin.legalAddon)) return skin.legalAddon;
  return mentions(skin, COACHING_WORDS) ? 'coaching' : null;
}

/**
 * A studio's form scope: its own setting (tenants.health_declaration) when it has
 * one, otherwise its field's default; the add-on always from its field.
 */
export function studioFormsScope(
  skin: FieldSkin,
  healthSetting: boolean | null | undefined,
): { healthDeclarations: boolean; legalAddon: SignedAddon | null } {
  return {
    healthDeclarations: typeof healthSetting === 'boolean' ? healthSetting : fieldHealthDeclarations(skin),
    legalAddon: fieldLegalAddon(skin),
  };
}
