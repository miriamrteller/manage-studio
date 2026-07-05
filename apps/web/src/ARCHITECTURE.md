# Component Architecture Guidelines

This document outlines the refactored component architecture for reliable, scalable, and correct React code.

## Core Principles

1. **Separation of Concerns**: Pages (composition), Components (UI), Hooks (logic)
2. **Feature-Based Organization**: Domain code lives under `src/features/[name]/` (components, hooks, services); shared shells under `src/components/`
3. **Smart + Presentational Split**: Hooks contain logic; components are UI-only
4. **Centralized Schemas**: All validation in `src/schemas/`
5. **Accessibility First**: WCAG 2.1 Level AA on all components
6. **No Magic**: Explicit data flow, no implicit state management

## Folder Structure (implemented — hybrid)

New work goes in **`features/`**. Legacy code may still live under **`components/`** (Dashboard, Navigation, Auth) — migrate when touching those areas.

```
src/
├── features/                   # Primary: domain modules
│   ├── enrolment/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── service.ts
│   ├── finance-admin/
│   ├── admin-dashboard/
│   ├── people/
│   ├── classes/                # offerings UI (rename deferred — see code-rename-epic)
│   └── …
│
├── layouts/                    # Structural shells (auth, nav, footer)
│   ├── PublicLayout.tsx
│   ├── ProtectedLayout.tsx
│   └── RouteGuards.tsx
│
├── pages/                      # Route composition (thin — import from features/)
│   ├── AdminClassesPage.tsx
│   ├── AdminDashboard.tsx
│   └── …
│
├── components/                 # Shared + legacy feature shells
│   ├── Dashboard/              # Legacy — AdminPanel, useAdminDashboard
│   ├── Navigation/
│   ├── shared/
│   └── ui/                     # shadcn/ui — do not hand-edit
│
├── hooks/                      # Cross-cutting hooks (useTenant, useAuth, …)
├── services/                   # BaseService and shared clients
├── lib/
├── i18n/
└── router.tsx
```

**Schemas:** Zod types live in `packages/shared` (`@shared/schemas`); web-only schemas in `apps/web/src/schemas/` if needed.

## Component Types

### Pages (src/pages/)

**Responsibility**: Route composition containers

**Rules**:
- Maximum 50 lines
- Only compose layouts, route guards, and child components
- No business logic, state management, or API calls
- No inline styles or custom CSS
- Must use `<Layout><Guard><Component /></Guard></Layout>` pattern

**Example**:
```tsx
export default function LoginPage() {
  return (
    <PublicLayout>
      <h1>{t('pages.login.title')}</h1>
      <LoginForm ... />
    </PublicLayout>
  );
}
```

### Smart Components (src/components/[Feature]/*.tsx)

**Responsibility**: Business logic + UI rendering

**Rules**:
- Use one or more hooks for data fetching and state
- Manage loading, error, and empty states
- Pass data to presentational components
- Maximum 100 lines
- Use conditional rendering for state display

**Example**:
```tsx
export function ClassesList() {
  const { classes, isLoading, error } = useClasses();
  
  if (isLoading) return <div role="status">{t('loading')}</div>;
  if (error) return <div role="alert">{t('error')}</div>;
  if (!classes.length) return <div>{t('empty')}</div>;
  
  return (
    <div role="list">
      {classes.map(c => <ClassCard key={c.id} class={c} />)}
    </div>
  );
}
```

### Presentational Components (src/components/[Feature]/*.tsx)

**Responsibility**: UI rendering only

**Rules**:
- Receive data as props, no hooks except `useTranslation` and `useNavigate`
- No API calls, no state management (use parent's state)
- Pure function: same props = same output
- Maximum 80 lines
- Full focus on styling and user interaction

**Example**:
```tsx
export function ClassCard({ class: cls, locale, currency }: ClassCardProps) {
  return (
    <div className="...">
      <h3>{cls.name}</h3>
      <p>{formatCurrency(cls.price_minor, currency, locale)}</p>
      <button onClick={handleEnrol}>{t('enrol')}</button>
    </div>
  );
}
```

### Hooks (src/hooks/)

**Responsibility**: Business logic and state management

**Rules**:
- Fetch data, validate with Zod, manage caching
- Return data + loading + error states
- One responsibility per hook
- No side effects beyond API calls
- Testable in isolation

**Example**:
```tsx
export function useClasses() {
  const tenant = useTenant();
  
  const { data: classes = [], isLoading, error } = useQuery({
    queryKey: ['publicClasses', tenant?.id],
    queryFn: async () => {
      const { data } = await supabase.from('classes').select(...);
      return z.array(PublicClassSchema).parse(data);
    },
  });
  
  return { classes, isLoading, error };
}
```

## Design Patterns

### Smart Component + Hook Pattern

```
Page → Smart Component → Hook (data) → Presentational Components (UI)
```

**Data Flow**:
1. Page composes layout + smart component
2. Smart component uses hook for data
3. Hook fetches, validates, caches
4. Smart component renders presentational components with data
5. Presentational components render UI only

### Feature Folder Pattern

```
components/
├── Auth/
│   ├── LoginForm.tsx         # Smart component
│   ├── AuthMessage.tsx       # Presentational component
│   └── index.ts              # Exports
```

Each feature folder contains:
- One or more smart components (manage data)
- One or more presentational components (render UI)
- `index.ts` to export public API

### Validation with Zod

```
schemas/auth.ts
├── LoginFormSchema (form input validation)
├── SignupFormSchema (form input validation)

hooks/useLogin.ts
├── Validates input with LoginFormSchema
├── Calls Supabase
├── Returns success/error

components/Auth/LoginForm.tsx
├── Uses LoginFormSchema in react-hook-form
├── Passes to useLogin hook
```

## Accessibility (WCAG 2.1 Level AA)

### Required ARIA Patterns

**Loading State**:
```tsx
<div role="status" aria-live="polite" aria-label={t('loading')}>
  {t('common.loading')}
</div>
```

**Error State**:
```tsx
<div role="alert" aria-live="assertive">
  {error.message}
</div>
```

**Form Field**:
```tsx
<label htmlFor="email">{t('form.email')}</label>
<input
  id="email"
  aria-invalid={!!error}
  aria-describedby={error ? 'email-error' : undefined}
/>
<p id="email-error">{error}</p>
```

**Button Focus**:
```tsx
<button className="... focus-visible:outline-2 outline-primary outline-offset-2">
  {t('action')}
</button>
```

## Creating New Features

1. **Create folder**: `components/[Feature]/`
2. **Create smart component**: `components/[Feature]/[Feature].tsx`
3. **Create hook**: `hooks/use[Feature].ts`
4. **Create schemas (if needed)**: `schemas/[feature].ts`
5. **Create presentational components**: `components/[Feature]/[Component].tsx`
6. **Export from index.ts**: `components/[Feature]/index.ts`
7. **Use in page**: Import and compose in `pages/[Feature]Page.tsx`

Example: Enrolment Feature

```
components/Enrolment/
├── EnrolmentStepper.tsx    # Smart: Manages enrolment flow
├── ClassSelector.tsx       # Smart: Filter + select classes
├── CheckoutForm.tsx        # Smart: Payment form
├── ClassRequirement.tsx    # Presentational: Display requirement
└── index.ts

hooks/
├── useEnrolment.ts         # Enrolment flow state
├── useAvailableClasses.ts  # Filter classes by requirements
└── useCheckout.ts          # Payment processing

pages/
└── EnrolmentPage.tsx       # Layout + EnrolmentStepper
```

## Testing Strategy

See [TESTING.md](./TESTING.md) for detailed testing patterns.

**Quick Summary**:
- Unit tests for hooks (business logic)
- Component tests for smart components (hook integration)
- Component tests for presentational components (UI rendering)
- E2E tests for full page flows

## Code Review Checklist

When reviewing new components:

- [ ] Page file < 50 lines (light composition only)
- [ ] Smart components have hooks for data
- [ ] Presentational components receive all data as props
- [ ] All input validated with Zod
- [ ] WCAG ARIA patterns present (labels, roles, live regions)
- [ ] Feature folder has clear organization
- [ ] exports from index.ts (not scattered imports)
- [ ] No hardcoded strings (use i18n)
- [ ] No magic CSS (use Tailwind utilities)
- [ ] TypeScript no `any` (use `unknown` if needed)
- [ ] Error handling with proper messaging
- [ ] Loading states with role="status"
- [ ] Empty states with helpful messaging
