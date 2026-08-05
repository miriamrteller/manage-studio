# Design System — manage-studio

> Last updated: 2026-08-05  
> Applies to: `apps/web/src/` — all components, pages, and utilities

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

Five elevation levels are defined in `index.css` as CSS custom properties:

```css
--elevation-0: none;
--elevation-1: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.04);
--elevation-2: 0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06);
--elevation-3: 0 10px 15px rgba(0,0,0,.1), 0 4px 6px rgba(0,0,0,.05);
--elevation-4: 0 20px 25px rgba(0,0,0,.1), 0 10px 10px rgba(0,0,0,.04);
```

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
