# Pull Request Template

## Description
Please include a summary of the changes and related issues.

### Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Closes #(issue number)

## Testing
Please describe the tests you ran and how to reproduce them.

- [ ] Unit tests pass
- [ ] Manual testing completed

## Accessibility Checklist (WCAG 2.1 Level AA)
All UI changes must pass WCAG 2.1 Level AA automated tests before merge.

- [ ] No new heading level skips (h1 → h3)
- [ ] Form inputs have associated labels (`<label htmlFor>`)
- [ ] Color contrast ≥ 4.5:1 for text (APCA standard for Hebrew)
- [ ] Keyboard-only navigation works (Tab, Enter, Escape)
- [ ] Error messages announce via `aria-live="polite"`
- [ ] No autofocus on page load
- [ ] Modal focus traps working (verified with Tab)
- [ ] ESLint jsx-a11y: zero warnings in new code

## Additional Checks
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No console errors in dev
