/**
 * What a studio's field (its skin) means for the forms its clients sign:
 * whether they sign a health declaration, and which add-on its agreement has.
 *
 * A skin row can say both (verticals.default_switches.health_declaration and
 * verticals.legal_addon). Built-in skins keep today's rules. A data skin that
 * says nothing is read from its id and names: sport and movement fields sign a
 * health declaration; tutors, coaches and therapists get the coaching add-on.
 */
import { type SignedAddon } from './signed-template.js';
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
/** Whether a new studio in this field has "Clients sign a health declaration" on. */
export declare function fieldHealthDeclarations(skin: FieldSkin): boolean;
/** The add-on this field's agreement carries, if any. */
export declare function fieldLegalAddon(skin: FieldSkin): SignedAddon | null;
/**
 * A studio's form scope: its own setting (tenants.health_declaration) when it has
 * one, otherwise its field's default; the add-on always from its field.
 */
export declare function studioFormsScope(skin: FieldSkin, healthSetting: boolean | null | undefined): {
    healthDeclarations: boolean;
    legalAddon: SignedAddon | null;
};
//# sourceMappingURL=field-defaults.d.ts.map