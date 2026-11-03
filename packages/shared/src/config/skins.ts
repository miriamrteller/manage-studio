/**
 * Skins as data: one row in `verticals` describes a skin. The platform owner
 * edits them on /platform/skins; the set-up wizard offers the live ones.
 *
 * Built-in skins (dance-studio, photographer, beautician, generic) keep their
 * code overlays (wording, legal variants, menus). For them the data wording is
 * ignored, so studios on a built-in skin never change when a row is edited.
 * A new skin is data only: in code it behaves like `generic` (safeVertical),
 * plus its own wording, switches and choices from the row.
 */
import { z } from 'zod'
import type { EntityKey, EntityLabelLocale, EntityLabels, VerticalId } from './tenant-presets.js'
import type { PaymentFlow, StudioProfile } from './studio-profile.js'
import { PRESET_QUESTIONS, type PresetKey } from '../leadForm.js'

/** Any skin id (tenants.skin / verticals.id). Built-in ones are also a VerticalId. */
export type SkinId = string

export const BUILT_IN_SKINS: readonly VerticalId[] = ['dance-studio', 'photographer', 'beautician', 'generic']

export function isBuiltInSkin(id: string | null | undefined): id is VerticalId {
  return BUILT_IN_SKINS.includes(id as VerticalId)
}

export type SkinStatus = 'draft' | 'live'

/** The existing 07c add-ons a skin can bring. */
export const LEGAL_ADDONS = ['photographer', 'beautician', 'coaching'] as const
export type LegalAddon = (typeof LEGAL_ADDONS)[number]

/** The main nouns a skin may rename (the same keys as the studio's own wording). */
export const SKIN_NOUN_KEYS: readonly EntityKey[] = [
  'contact',
  'account',
  'offering',
  'engagement',
  'session',
  'staff',
  'season',
  'category',
]

export const SKIN_ID_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/
const HEX = /^#[0-9A-Fa-f]{6}$/

/** Default switches for NEW studios on this skin. Missing = the general default. */
export interface SkinSwitches {
  paymentFlow?: PaymentFlow
  teachesClasses?: boolean
  familyAccounts?: boolean
  clientBooking?: boolean
  /** The health-declaration setting (being added in another change); optional until then. */
  healthDeclaration?: boolean
}

export type SkinLabels = Partial<Record<EntityLabelLocale, Partial<EntityLabels>>>

export interface Skin {
  id: SkinId
  nameEn: string
  nameHe: string
  hintEn: string
  hintHe: string
  status: SkinStatus
  marketingPages: string[]
  switches: SkinSwitches
  labels: SkinLabels
  legalAddon: LegalAddon | null
  enquiryPresets: PresetKey[]
  colours: { primary?: string; accent?: string }
  sortOrder: number
}

/** Columns read from `verticals`. */
export const SKIN_COLUMNS =
  'id, name_en, name_he, hint_en, hint_he, status, marketing_pages, default_switches, label_overrides, legal_addon, enquiry_presets, colours, sort_order'

const Pair = z.object({ singular: z.string().trim().min(1).max(40), plural: z.string().trim().min(1).max(40) })
const LocaleLabels = z.record(z.string(), z.unknown()).transform((raw) => {
  const out: Partial<EntityLabels> = {}
  for (const key of SKIN_NOUN_KEYS) {
    const parsed = Pair.safeParse(raw[key])
    if (parsed.success) out[key] = parsed.data
  }
  return out
})

function obj(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

function bool(raw: unknown): boolean | undefined {
  return typeof raw === 'boolean' ? raw : undefined
}

export function parseSkinSwitches(raw: unknown): SkinSwitches {
  const o = obj(raw)
  const out: SkinSwitches = {}
  const flow = o.payment_flow
  if (flow === 'recurring' || flow === 'project' || flow === 'both') out.paymentFlow = flow
  const pairs: [keyof SkinSwitches, string][] = [
    ['teachesClasses', 'teaches_classes'],
    ['familyAccounts', 'family_accounts'],
    ['clientBooking', 'client_booking'],
    ['healthDeclaration', 'health_declaration'],
  ]
  for (const [key, col] of pairs) {
    const v = bool(o[col])
    if (v !== undefined) (out as Record<string, unknown>)[key] = v
  }
  return out
}

export function parseSkinLabels(raw: unknown): SkinLabels {
  const o = obj(raw)
  const out: SkinLabels = {}
  for (const locale of ['en', 'he'] as const) {
    const parsed = LocaleLabels.safeParse(obj(o[locale]))
    if (parsed.success && Object.keys(parsed.data).length > 0) out[locale] = parsed.data
  }
  return out
}

export function parseSkinRow(row: Record<string, unknown>): Skin {
  const colours = obj(row.colours)
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const addon = row.legal_addon
  return {
    id: str(row.id),
    nameEn: str(row.name_en),
    nameHe: str(row.name_he),
    hintEn: str(row.hint_en),
    hintHe: str(row.hint_he),
    status: row.status === 'live' ? 'live' : 'draft',
    marketingPages: Array.isArray(row.marketing_pages) ? row.marketing_pages.filter((p): p is string => typeof p === 'string') : [],
    switches: parseSkinSwitches(row.default_switches),
    labels: parseSkinLabels(row.label_overrides),
    legalAddon: (LEGAL_ADDONS as readonly unknown[]).includes(addon) ? (addon as LegalAddon) : null,
    enquiryPresets: Array.isArray(row.enquiry_presets)
      ? row.enquiry_presets.filter((k): k is PresetKey => typeof k === 'string' && k in PRESET_QUESTIONS)
      : [],
    colours: {
      ...(typeof colours.primary === 'string' && HEX.test(colours.primary) ? { primary: colours.primary } : {}),
      ...(typeof colours.accent === 'string' && HEX.test(colours.accent) ? { accent: colours.accent } : {}),
    },
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 100,
  }
}

/** The row written to `verticals` for a skin (empty wording pairs are dropped). */
export function toSkinRow(skin: Skin) {
  const switches: Record<string, unknown> = {}
  if (skin.switches.paymentFlow) switches.payment_flow = skin.switches.paymentFlow
  if (skin.switches.teachesClasses !== undefined) switches.teaches_classes = skin.switches.teachesClasses
  if (skin.switches.familyAccounts !== undefined) switches.family_accounts = skin.switches.familyAccounts
  if (skin.switches.clientBooking !== undefined) switches.client_booking = skin.switches.clientBooking
  if (skin.switches.healthDeclaration !== undefined) switches.health_declaration = skin.switches.healthDeclaration
  const labels: Record<string, Partial<EntityLabels>> = {}
  for (const locale of ['en', 'he'] as const) {
    const cleaned = parseSkinLabels({ [locale]: skin.labels[locale] ?? {} })[locale]
    if (cleaned) labels[locale] = cleaned
  }
  return {
    id: skin.id,
    name_en: skin.nameEn.trim(),
    name_he: skin.nameHe.trim(),
    hint_en: skin.hintEn.trim(),
    hint_he: skin.hintHe.trim(),
    status: skin.status,
    marketing_pages: skin.marketingPages,
    default_switches: switches,
    label_overrides: labels,
    legal_addon: skin.legalAddon,
    enquiry_presets: skin.enquiryPresets,
    colours: skin.colours,
    sort_order: skin.sortOrder,
  }
}

/** Problems that stop a skin from being saved (keys for the form's messages). */
export function skinErrors(skin: Skin): string[] {
  const errors: string[] = []
  if (!SKIN_ID_RE.test(skin.id)) errors.push('id')
  if (!skin.nameEn.trim() || skin.nameEn.trim().length > 80) errors.push('name_en')
  if (!skin.nameHe.trim() || skin.nameHe.trim().length > 80) errors.push('name_he')
  for (const locale of ['en', 'he'] as const) {
    for (const key of SKIN_NOUN_KEYS) {
      const pair = skin.labels[locale]?.[key]
      if (!pair) continue
      const hasOne = Boolean(pair.singular.trim()) !== Boolean(pair.plural.trim())
      if (hasOne) errors.push(`label_${locale}_${key}`)
    }
  }
  return errors
}

/** The skin's own main-noun wording. Empty for built-in skins: their code wording stays. */
export function skinLabelsFor(skin: Pick<Skin, 'id' | 'labels'> | null | undefined, locale: EntityLabelLocale): Partial<EntityLabels> {
  if (!skin || isBuiltInSkin(skin.id)) return {}
  return skin.labels[locale] ?? {}
}

/** The business profile the wizard prefills for a skin; missing switches keep the fallback. */
export function profileFromSkin(skin: Pick<Skin, 'switches'>, fallback: StudioProfile): StudioProfile {
  return {
    paymentFlow: skin.switches.paymentFlow ?? fallback.paymentFlow,
    teachesClasses: skin.switches.teachesClasses ?? fallback.teachesClasses,
    familyAccounts: skin.switches.familyAccounts ?? fallback.familyAccounts,
    clientBooking: skin.switches.clientBooking ?? fallback.clientBooking,
  }
}

/** The live skin a marketing industry page points to (by page slug), if any. */
export function skinForMarketingPage<T extends Pick<Skin, 'status' | 'marketingPages'>>(skins: T[], page: string | null | undefined): T | null {
  const slug = (page ?? '').trim().toLowerCase()
  if (!slug) return null
  return skins.find((s) => s.status === 'live' && s.marketingPages.includes(slug)) ?? null
}

export function skinName(skin: Pick<Skin, 'nameEn' | 'nameHe'>, locale: string): string {
  return locale.startsWith('he') ? skin.nameHe : skin.nameEn
}

export function skinHint(skin: Pick<Skin, 'hintEn' | 'hintHe'>, locale: string): string {
  return locale.startsWith('he') ? skin.hintHe : skin.hintEn
}

/** A blank new skin: draft, general switches, no extras. */
export function emptySkin(): Skin {
  return {
    id: '',
    nameEn: '',
    nameHe: '',
    hintEn: '',
    hintHe: '',
    status: 'draft',
    marketingPages: [],
    switches: { paymentFlow: 'both', teachesClasses: false, familyAccounts: false, clientBooking: false },
    labels: {},
    legalAddon: null,
    enquiryPresets: [],
    colours: {},
    sortOrder: 100,
  }
}
