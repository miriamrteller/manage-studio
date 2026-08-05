# Design System Documentation

_Introduced by DL-DESIGN-001 (design system polish). This documents the token
system, elevation, typography, spacing, RTL, and accessibility conventions
added in that batch, adapted to this repo's actual CSS-variable architecture._

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
- Use semantic z-index tiers: `--z-base`, `--z-raised`, `--z-overlay`,
  `--z-modal`, `--z-toast`, `--z-tooltip`.

## Typography Scale
- Use semantic components from `src/components/ui/typography.tsx`
  (`Display`, `H1`–`H4`, `BodyLarge`, `Body`, `BodySmall`, `Caption`).
- Heebo (Google Fonts) loads via `index.html` and is applied globally through
  `--font-family-sans`; `[dir="rtl"]` additionally raises the line-heights on
  the typography utility classes for Hebrew legibility.

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
- Use logical properties: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`,
  `text-end`, `start-*`, `end-*`.
- Physical direction classes (`ml-`, `mr-`, `pl-`, `pr-`, `text-left`,
  `text-right`, `left-*`, `right-*` used for edge-anchoring) are deprecated.
- `tailwindcss-rtl` is now enabled in `tailwind.config.js`.
- FullCalendar toolbar direction/order adapts automatically under `[dir="rtl"]`.
- One exception left as physical on purpose: the loading-spinner's
  `border-r-transparent` in `button.tsx` — it creates the visual "gap" on a
  *rotating* circle and has no reading-direction meaning, so converting it to
  `border-e-transparent` would be a no-op at best.
- Absolute-positioned elements that are centered via `left-1/2
  -translate-x-1/2` were deliberately **left untouched** — that pattern mixes
  a logical position with a physical transform, and swapping to
  `start-1/2 -translate-x-1/2` would break centering under `dir="rtl"`
  (the translate always moves along the physical X-axis).

## Accessibility
- All animations respect `prefers-reduced-motion` (global override in
  `index.css`, plus explicit guards on the micro-interaction/animation
  utility classes).
- `Modal` (native `<dialog>`) and `Dialog` (compound component) both now:
  focus-trap while open, focus the first focusable element on open, return
  focus to the previously-focused element on close, and use
  `role="dialog"`/`aria-modal`/`aria-labelledby`/`aria-describedby`.
- Use semantic HTML and proper heading hierarchy; prefer the typography
  components over ad hoc heading classes going forward.

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
