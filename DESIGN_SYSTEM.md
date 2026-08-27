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
- **Focus ring:** Use `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]` — never suppress `:focus-visible`

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
