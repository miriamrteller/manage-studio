# Design System — manage-studio

> Last updated: 2026-08-27  
> Applies to: `apps/web/src/` — all components, pages, and utilities

---

## 0. The Finish Layer (DL-DESIGN-009)

The "designed" feel — depth, light, and softness — comes from a token layer in
`index.css` where **every value is derived at paint time from the tenant's
injected brand primitives** via `color-mix()`. Nothing here introduces a
literal color, so white-label branding and the font system stay fully in
control.

| Token | What it is |
|---|---|
| `--radius-control` / `--radius-surface` / `--radius-overlay` | Semantic radius ramp: buttons+inputs (10px), cards (14px), modals (20px). Utilities: `rounded-control`, `rounded-surface`, `rounded-overlay`. |
| `--tint-primary-05/10/15/25` | Transparent washes of the tenant primary. Use these instead of any hardcoded `rgba()` tint. |
| `--shadow-ink` | Near-black nudged toward the brand hue; the ink all elevation shadows are cast in. |
| `--border-hairline` | Neutral border with a barely-there brand tint. Utility: `border-hairline`. |
| `--focus-halo` / `--focus-halo-error` | Soft outer ring of the two-part focus style (crisp 2px outline + 4px halo). |
| `--sheen-raised` / `--edge-emboss` | Translucent white/black overlays for raised controls — hue-neutral, so they sit on any tenant color. |
| `--wash-brand` | Ambient radial brand-tint gradient for page/hero backgrounds. Utility: `bg-brand-wash`. |

Rules:

- **Never** hardcode a tint (`rgba(118,51,90,.1)`-style values are forbidden); use the `--tint-primary-*` ramp or `color-mix()` from a token.
- Gradients on colored controls must be **overlays** (translucent white/black), never a second color — that is what keeps tenant hues intact.
- Elevation levels 1–4 are layered (contact + ambient shadow) and brand-tinted automatically; just use `elevation-*` as before.

### Soft theme tokens (Phase 1 of `docs/design/photographer-theme-proposal.md`)

`deriveSoftTheme()` (`apps/web/src/lib/theme/deriveSoftTheme.ts`) runs in
`useThemeInjection()` and writes per-tenant tokens derived from the tenant's
primary and accent colours. Every pairing below is unit-tested at ≥ 4.5:1
for 9 sample brands plus 200 random colours.

| Token | What it is |
|---|---|
| `--color-primary-ink` / `--color-accent-ink` | The brand colour **as text**: unchanged for dark brands, darkened only as far as 4.5:1 on white and the lighter tints for light ones. Tailwind `text-primary`, `text-secondary`, `text-accent`, `ring-primary`, `outline-primary` use it. |
| `--color-primary-fill` / `--color-on-primary-fill` | Solid button fill and its text colour. Equal to the brand unless no text colour reaches 4.5:1 on it. |
| `--tint-ground`, `--tint-1/2/3`, `--tint-accent-1/2` | Brand tints at fixed WCAG luminance (0.97 / 0.93 / 0.87 / 0.78), so every brand is equally subtle. |
| `--color-neutral-50…900`, `--color-text-primary/secondary/muted` | **Tenant-tinted greys**: Tailwind gray with up to 10% of the brand mixed in (more in darker steps). Text greys are pushed darker if needed: primary ≥ 12:1 and secondary ≥ 4.5:1 on every tint, muted ≥ 4.5:1 on white and the lighter tints. Tailwind `gray-*` classes resolve to this scale. |
| `--wash-page`, `--gradient-header`, `--gradient-footer` | Gradients composed from the tints, mirrored under `[dir='rtl']`. Defined, not yet applied (Phase 2). |

Rules:

- Brand colour on **text, icons, rings or outlines** → `--color-primary-ink` (`text-primary`), never raw `var(--color-primary)`.
- Brand colour as a **fill** → `bg-primary` / `--color-primary-fill`.
- Greys are never hard-coded: use `gray-*` / `--color-neutral-*` / `--color-text-*`, which follow the tenant. No opacity modifiers on `gray-*` (they are CSS variables).

---

## 1. Color System

All colors are expressed via CSS custom properties. **Never hardcode hex values.**

| Token | Usage |
|---|---|
| `var(--color-primary)` | Brand primary (buttons, links, active states) |
| `var(--color-secondary)` | Secondary actions |
| `var(--color-text-primary)` | Main body text |
| `var(--color-text-secondary)` | Muted / supporting text |
| `var(--surface-base)` | Card and panel backgrounds |
| `var(--border-default)` | Default border color |
| `var(--color-error)` | Destructive / error states |
| `var(--color-success)` | Confirmation / success states |

Colors are resolved at runtime from the tenant's white-label config via `useTenant()` → `useThemeInjection()`. Never read tenant colors directly.

---

## 2. Elevation (Box Shadows)

Five elevation levels are defined in `index.css` as CSS custom properties.
Since DL-DESIGN-009 each level is a **layered** shadow (a tight "contact"
shadow plus a wide soft "ambient" one) cast in `--shadow-ink` — near-black
mixed toward the tenant primary hue — rather than flat `rgba(0,0,0,…)`:

```css
--elevation-0: none;
--elevation-1: 0 1px 2px color-mix(in srgb, var(--shadow-ink) 7%, transparent),
  0 1px 1px color-mix(in srgb, var(--shadow-ink) 5%, transparent);
/* …levels 2–4 scale the same contact+ambient pair up; see index.css */
```

Do not restate shadow values in components — always reference `--elevation-*`
(or the `elevation-*` utility classes) so the tinted ramp stays the single
source of truth.

### Usage in Tailwind

Apply static elevation with the utility class: `elevation-1`, `elevation-2`, etc.

For **hover transitions**, use the arbitrary-value syntax — Tailwind JIT does not generate
`hover:` variants for custom utilities registered via `@layer utilities`:

```tsx
// ✅ Correct — arbitrary value that Tailwind JIT can resolve
className="elevation-1 hover:[box-shadow:var(--elevation-2)]"

// ❌ Wrong — Tailwind JIT will not emit a hover variant for a custom utility
className="elevation-1 hover:elevation-2"
```

---

## 3. Typography

| Class | Usage |
|---|---|
| `text-h1` – `text-h6` | Headings (map to semantic heading levels) |
| `text-body` | Default body copy |
| `text-body-sm` | Small / supporting copy |
| `text-label` | Form labels |
| `text-caption` | Timestamps, metadata |

Do not use raw `font-size` utilities (`text-sm`, `text-xl`) for semantic text. Use the named scale.

---

## 4. RTL & Logical CSS

The codebase is bilingual: Hebrew (RTL) and English (LTR). The `dir` attribute is set only on the `<html>` element by `DocumentLanguageSync`. **All layout must use logical CSS properties.**

### Positioning

**Forbidden — physical properties break in RTL:**

```css
/* ❌ Never use physical positioning */
left: 50%;
right: 0;
margin-left: auto;
padding-right: 1rem;
```

**Required — logical properties are RTL-safe:**

```css
/* ✅ Use logical positioning */
inset-inline-start: 0;   /* replaces left in LTR, right in RTL */
inset-inline-end: 0;     /* replaces right in LTR, left in RTL */
inset-block-start: 0;    /* replaces top */
inset-block-end: 0;      /* replaces bottom */
```

**In Tailwind:**

```tsx
// ✅ RTL-safe
className="inset-inline-start-0 ms-auto pe-4"

// ❌ Breaks in RTL
className="left-0 ml-auto pr-4"
```

### Centering elements

To center an absolutely-positioned element horizontally in a way that works in both LTR and RTL, use `margin-inline: auto` or Flexbox/Grid — not physical translate patterns:

```tsx
// ✅ RTL-safe centering
<div className="flex justify-center">…</div>

// ✅ RTL-safe absolute centering with margin
<div className="absolute inset-x-0 mx-auto w-fit">…</div>

// ❌ Physical — breaks in RTL
<div style={{ left: '50%', transform: 'translateX(-50%)' }}>…</div>
```

### Tailwind logical utilities quick reference

| Physical (forbidden) | Logical (required) |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `left-*` / `right-*` | `inset-inline-start-*` / `inset-inline-end-*` |
| `border-l` / `border-r` | `border-s` / `border-e` |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |

### Exception — spinner/loading animations

`border-r-transparent` is permitted in spinner and loading-animation components (e.g. `button.tsx`'s loading state). This is **not** a layout or reading-direction property: it creates the visual "gap" on a continuously rotating circle, so it carries no inline-axis meaning and `border-e-transparent` would be a no-op. This exception covers that single decorative technique only — it is **not** a licence to use physical border, spacing, or positioning properties anywhere else.

---

## 5. Motion & Transitions

The codebase uses a `motion-safe` guard on all transitions so users with `prefers-reduced-motion` never see animation:

```tsx
className="motion-safe:transition-shadow duration-200 ease-out"
```

Always pair animated classes with `motion-safe:`.

---

## 6. Interaction Patterns

- **Lift on hover:** `elevation-1 hover:[box-shadow:var(--elevation-2)] motion-safe:transition-shadow duration-200 ease-out`
- **Interactive card (keyboard):** Add `role="button"`, `tabIndex={0}`, and `onKeyDown` handler for Enter/Space (see `Card` component for reference implementation)
- **Focus ring:** Use `focus-visible:ring-2 focus-visible:ring-primary` (brand ink) — never suppress `:focus-visible`

---

## 7. White-Label Rules

- **Forbidden:** Hardcoded hex colors, arbitrary Tailwind color values (`text-[#76335a]`)
- **Required:** CSS variables, semantic class names, `TenantWhiteLabelSchema` validation
- Always load colors through `useTenant()` → `useThemeInjection()`; never query tenant colors directly

---

## 8. File & Component Size Limits

| Unit | Limit |
|---|---|
| File | 250 lines |
| Component | 150 lines |
| No `any` | Use `unknown` or `never` |
| No non-null assertions (`!`) | Handle nullability explicitly |

---

## 9. How it is built in `apps/web`

Implementation detail for the rules above (moved here from the old `apps/web/DESIGN_SYSTEM.md`, so there is one copy). File paths are relative to `apps/web/`. For RTL, section 4 above is the rule.

### Token System
- All colors use CSS custom properties from `:root` in `src/index.css`.
- Tenant branding automatically applies through `useThemeInjection()`, which
  overwrites the Layer 1 primitives (`--color-primary`, `--color-secondary`,
  the neutral scale, etc.) at runtime per tenant.
- Never use hard-coded hex values in components. New semantic tokens added by
  this batch (`--surface-*`, `--state-*`, `--border-*`) are **aliases** onto
  the existing Layer 1/2 primitives — they do not introduce a second,
  parallel color source, so tenant white-labeling keeps working everywhere.

### Elevation System
- 5 levels: `elevation-0` through `elevation-4` (utility classes + CSS vars).
- Shadows are intentionally neutral (black-based), not tenant-brand-colored —
  this matches near-universal design system convention and there is no
  brand-derived "foreground" HSL-triplet variable in this codebase to derive
  a colored shadow from.
- Static elevation uses the utility class (`elevation-1`, `elevation-2`, …).
  For **hover** elevation use the arbitrary-value syntax
  `hover:[box-shadow:var(--elevation-2)]` — Tailwind JIT does not emit
  `hover:` variants for custom utilities registered via `@layer utilities`,
  so `hover:elevation-2` is a dead class.
- Use semantic z-index tiers: `--z-base`, `--z-raised`, `--z-overlay`,
  `--z-modal`, `--z-toast`, `--z-tooltip`.

### Typography Scale
- Use semantic components from `src/components/ui/typography.tsx`
  (`Display`, `H1`–`H4`, `BodyLarge`, `Body`, `BodySmall`, `Caption`).
- Webfonts are self-hosted: every tenant font pair (see `FONT_PAIRS` in
  `src/hooks/useFontLoader.ts`) is bundled via the `@fontsource` imports in
  `src/fonts.ts` — nothing is fetched from Google Fonts at runtime. Heebo is
  the default and is applied globally through `--font-family-sans`;
  `[dir="rtl"]` additionally raises the line-heights on the typography
  utility classes for Hebrew legibility.

### Spacing System
- An 8pt-grid spacing scale exists as `--spacing-0`…`--spacing-10` CSS
  variables, exposed to Tailwind under the **`sp-0`…`sp-10`** prefix (e.g.
  `p-sp-6`, `gap-sp-4`) — **not** under the bare `0`–`10` keys.
  - **Why the prefix:** this codebase uses stock Tailwind spacing utilities
    (`p-4`, `px-3`, `py-2`, `gap-4`, `mb-6`, …) in ~1,750 places. The original
    spec's plan of overriding the *default* spacing keys `0`–`10` with the
    new 8pt values would have silently changed nearly every padding/margin/
    gap in the live app (e.g. `p-4` moving from `1rem` to `0.75rem`). That
    was assessed as a site-wide visual regression, not a polish, so the new
    scale ships under `sp-*` instead. Existing utility classes are
    byte-for-byte unaffected.
  - New/updated components should prefer `sp-*` spacing for a consistent 8pt
    rhythm; migrating existing call sites off the default Tailwind scale is
    a deliberate follow-up, not part of this batch.
- Form controls now use the shared `.form-control-base` CSS class
  (`--spacing-3`/`--spacing-4` padding) instead of ad hoc Tailwind padding.

### Accessibility
- All animations respect `prefers-reduced-motion` (global override in
  `index.css`, plus explicit guards on the micro-interaction/animation
  utility classes). Pair animated classes with `motion-safe:`.
- `Modal` (native `<dialog>`) and `Dialog` (compound component) both now:
  focus-trap while open, focus the first focusable element on open, return
  focus to the previously-focused element on close, and use
  `role="dialog"`/`aria-modal`/`aria-labelledby`/`aria-describedby`.
- Use semantic HTML and proper heading hierarchy; prefer the typography
  components over ad hoc heading classes going forward.
- Never suppress `:focus-visible`; use
  `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]`.

### Component Guidelines
- Extend base classes, don't override.
- Use data attributes for state variants (`data-error`, `data-size`).
- Preserve existing prop interfaces — every component touched in this batch
  only gained *optional* new props/attributes; nothing existing changed shape.
- Test in both LTR and RTL modes.

### Known Deviation From Original Spec — `dialog.tsx`
The original spec called for **deleting** `components/ui/dialog.tsx` and
migrating all importers to `components/ui/modal.tsx`. In practice:
- `dialog.tsx` exports a compound-component API (`Dialog`, `DialogTrigger`,
  `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`).
- `modal.tsx` exports a single component with a completely different shape
  (`isOpen` / `title` / `children` / `onClose`).
- 6 production components depend on the compound API, across billing,
  enrolment, and notifications flows (`CancelEnrolmentDialog`,
  `AgeReviewAdminPanel`, `NotificationBlastForm`, `SetPasswordDialog`,
  `NotificationLogDetailDialog`, `ContactPreferencesEditor`).

Rewriting those 6 call sites to a different API shape, with no build or test
run available in this pass, was judged too risky for a live app handling
payments and enrolment. Instead, `dialog.tsx` was upgraded in place — focus
trap, `aria-modal`, Escape handling, ARIA labelling, and token-based colors —
with its public API **unchanged**. Full consolidation onto `Modal` (likely by
giving `Modal` an optional compound-children mode) is flagged as a follow-up
task, not completed here.
