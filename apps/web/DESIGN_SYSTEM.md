# Design System Documentation

_Introduced by DL-DESIGN-001 (design system polish). This documents the token
system, elevation, typography, spacing, RTL, and accessibility conventions
added in that batch, adapted to this repo's actual CSS-variable architecture._

> **Authority note:** the root [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md) is the
> canonical rulebook for colour, elevation, typography, RTL and motion. This
> document is the `apps/web` companion — it records repo-specific
> implementation detail and deviations, and it must never contradict the root
> doc. Where the two ever disagree, the root doc wins.

## Token System
- All colors use CSS custom properties from `:root` in `src/index.css`.
- Tenant branding automatically applies through `useThemeInjection()`, which
  overwrites the Layer 1 primitives (`--color-primary`, `--color-secondary`,
  the neutral scale, etc.) at runtime per tenant.
- Never use hard-coded hex values in components. New semantic tokens added by
  this batch (`--surface-*`, `--state-*`, `--border-*`) are **aliases** onto
  the existing Layer 1/2 primitives — they do not introduce a second,
  parallel color source, so tenant white-labeling keeps working everywhere.

## Elevation System
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

## Typography Scale
- Use semantic components from `src/components/ui/typography.tsx`
  (`Display`, `H1`–`H4`, `BodyLarge`, `Body`, `BodySmall`, `Caption`).
- Webfonts are self-hosted: every tenant font pair (see `FONT_PAIRS` in
  `src/hooks/useFontLoader.ts`) is bundled via the `@fontsource` imports in
  `src/fonts.ts` — nothing is fetched from Google Fonts at runtime. Heebo is
  the default and is applied globally through `--font-family-sans`;
  `[dir="rtl"]` additionally raises the line-heights on the typography
  utility classes for Hebrew legibility.

## Spacing System
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

## RTL Support

The app is bilingual: Hebrew (RTL) and English (LTR). `dir` is set only on the
`<html>` element by `DocumentLanguageSync`. **All layout must use logical CSS
properties.** This section mirrors §4 of the root `DESIGN_SYSTEM.md`.

- Use logical properties: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`,
  `text-end`, `start-*`, `end-*` (these map to `inset-inline-start` /
  `inset-inline-end`).
- Physical direction properties and classes are **forbidden**, not merely
  discouraged: `margin-left`/`margin-right`, `padding-left`/`padding-right`,
  `left`/`right`, and their Tailwind equivalents `ml-*`, `mr-*`, `pl-*`,
  `pr-*`, `text-left`, `text-right`, `left-*`, `right-*`.
- `tailwindcss-rtl` is enabled in `tailwind.config.js`.
- FullCalendar toolbar direction/order adapts automatically under `[dir="rtl"]`.

### Quick reference

| Physical (forbidden) | Logical (required) |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `left-*` / `right-*` | `start-*` / `end-*` (`inset-inline-start-*` / `inset-inline-end-*`) |
| `border-l` / `border-r` | `border-s` / `border-e` |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |

### Centering absolutely-positioned elements

Do **not** centre with a physical offset plus a physical transform. That
pattern pins the element to a physical edge and then shifts it along the
physical X-axis, so it drifts or breaks the moment `dir` flips. Use
`margin-inline: auto` across a logical inset, or Flexbox/Grid:

```tsx
// ✅ RTL-safe — flex centring
<div className="flex justify-center">…</div>

// ✅ RTL-safe — absolute centring via logical inset + auto inline margin
<div className="absolute inset-x-0 mx-auto w-fit">…</div>

// ✅ RTL-safe — grid centring
<div className="absolute inset-0 grid place-items-center">…</div>

// ❌ Forbidden — physical offset + physical transform
<div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>…</div>
```

The same rule applies to vertical centring: prefer
`inset-0 grid place-items-center` or a flex container over a physical
`top: 50%` + `translateY(-50%)` pair, so block-axis offsets stay consistent
with the logical box model.

Any remaining call sites still using a physical offset + transform to centre
are **technical debt to be migrated**, not an approved exception. Migrate them
to one of the RTL-safe forms above when you touch the component.

### The one narrow exception

`button.tsx`'s loading spinner keeps `border-r-transparent`. This is *not* a
layout or reading-direction property: it creates the visual "gap" on a
continuously *rotating* circle, so it carries no inline-axis meaning and
`border-e-transparent` would be a no-op. This exception covers that single
decorative case only. It is not a licence to use physical properties for
positioning, spacing, or centring anywhere else.

## Accessibility
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

## Component Guidelines
- Extend base classes, don't override.
- Use data attributes for state variants (`data-error`, `data-size`).
- Preserve existing prop interfaces — every component touched in this batch
  only gained *optional* new props/attributes; nothing existing changed shape.
- Test in both LTR and RTL modes.

## Known Deviation From Original Spec — `dialog.tsx`
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
