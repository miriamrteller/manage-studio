# RTL Mirror Test Guide

## Purpose

Verify that the application layout correctly mirrors for right-to-left (RTL) languages like Hebrew.
This manual test ensures no physical CSS (left, right, ml-, mr-) is used — only logical CSS (start, end, ms-, me-, ps-, pe-).

## How to Run

### 1. Start the Development Server

```bash
pnpm run dev
```

Navigate to http://localhost:5173/

### 2. Flip to LTR in Browser DevTools

Open the browser's **Developer Tools Console** and run:

```javascript
document.documentElement.dir = 'ltr';
document.documentElement.lang = 'en';
```

This simulates an English (left-to-right) layout while keeping the Hebrew stylesheet active.

### 3. Visual Inspection Checklist

Check the following elements to ensure proper mirroring:

#### Header & Navigation
- [ ] Logo text is on the left (was on the right in RTL)
- [ ] Nav links are on the right (were on the left in RTL)
- [ ] Login button is on the far right (was on the far left in RTL)
- [ ] Focus rings appear correctly on all nav elements

#### Main Content (ClassesPage)
- [ ] Heading is left-aligned (was right-aligned in RTL)
- [ ] Class cards flow left-to-right (were right-to-left in RTL)
- [ ] Button text & icons are in correct order

#### Footer
- [ ] School info column is on the left (was on the right in RTL)
- [ ] Copyright column is on the right (was on the left in RTL)
- [ ] Footer border is at top (correct in both directions)

#### Forms (LoginPage)
- [ ] Email label is to the left of input (was to the right in RTL)
- [ ] Input field has correct padding direction
- [ ] Error messages appear below input (not floating)
- [ ] Submit button is correctly aligned

### 4. Check Computed Styles

For any suspicious element, right-click and **Inspect** to verify CSS:

**Good (logical CSS):**
```css
margin-inline-start: 1rem;  /* ✅ Logical */
padding-inline-end: 0.5rem; /* ✅ Logical */
```

**Bad (physical CSS):**
```css
margin-left: 1rem;  /* ❌ Physical - breaks in RTL */
padding-right: 0.5rem; /* ❌ Physical - breaks in RTL */
```

### 5. Reverse to RTL

Flip back to Hebrew to verify both directions work:

```javascript
document.documentElement.dir = 'rtl';
document.documentElement.lang = 'he';
```

Check that all elements flip correctly again.

## Potential Issues to Watch

| Issue | Cause | Fix |
|-------|-------|-----|
| Buttons/icons are backwards | Transform or flex-direction needs reversal | Use `flex-row-reverse` for RTL, check icon orientation |
| Text is cut off on edge | Fixed width with padding | Use `max-w-full` + `overflow-hidden` + logical padding |
| Inputs/buttons misaligned | Absolute positioning with `left`/`right` | Use `inset-inline-start`/`inset-inline-end` |
| Borders on wrong side | `border-left`/`border-right` | Use `border-inline-start`/`border-inline-end` |

## Automated Tests

After manual verification, run:

```bash
pnpm run a11y:e2e
```

This runs Playwright tests with axe-core accessibility checks, which also validate logical CSS usage.

## CSS References

- **Logical properties guide**: [MDN - CSS Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties)
- **Tailwind RTL support**: [tailwindcss-rtl plugin](https://github.com/20lives/tailwindcss-rtl)

## Success Criteria

✅ All elements appear correctly in both LTR and RTL modes
✅ No text is cut off or overlapping
✅ Focus rings and interactive states are visible
✅ No console errors when toggling dir attribute
✅ DevTools shows no physical CSS (left, right, ml-, mr-)
