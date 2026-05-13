# Component Architecture Guidelines

This document outlines the refactored component architecture for reliable, scalable, and correct React code.

## Core Principles

1. **Separation of Concerns**: Pages (composition), Components (UI), Hooks (logic)
2. **Feature-Based Organization**: Each feature has its own folder under `components/`
3. **Smart + Presentational Split**: Hooks contain logic; components are UI-only
4. **Centralized Schemas**: All validation in `src/schemas/`
5. **Accessibility First**: WCAG 2.1 Level AA on all components
6. **No Magic**: Explicit data flow, no implicit state management

## Folder Structure

```
src/
├── layouts/                    # Structural shells (auth, nav, footer)
│   ├── PublicLayout.tsx       # No auth required
│   ├── ProtectedLayout.tsx    # Auth required
│   └── RouteGuards.tsx        # Role-based access control
│
├── pages/                      # Light composition containers
│   ├── LoginPage.tsx          # Layout + LoginForm + Links
│   ├── ClassesPage.tsx        # Layout + ClassesList
│   ├── AdminDashboard.tsx     # Layout + AdminRoute + AdminPanel
│   └── PortalDashboard.tsx    # Layout + ParentRoute + ParentPortal
│
├── components/
│   ├── Auth/                  # Feature: Authentication
│   │   ├── LoginForm.tsx      # Smart: Form state + submission
│   │   ├── AuthMessage.tsx    # Presentational: Message display
│   │   └── index.ts
│   │
│   ├── Classes/               # Feature: Class listing
│   │   ├── ClassesList.tsx    # Smart: Fetch + display classes
│   │   ├── ClassCard.tsx      # Presentational: Single class
│   │   └── index.ts
│   │
│   ├── Dashboard/             # Feature: Admin & parent dashboards
│   │   ├── AdminPanel.tsx     # Smart: Admin dashboard
│   │   ├── ParentPortal.tsx   # Smart: Parent portal
│   │   ├── PortalCard.tsx     # Presentational: Dashboard card
│   │   └── index.ts
│   │
│   └── ui/                    # Headless UI primitives
│       ├── button.tsx         # Base button component
│       ├── card.tsx           # Base card component
│       ├── input.tsx          # Base input component
│       ├── dialog.tsx         # Base dialog component
│       └── ...other primitives
│
├── hooks/
│   ├── useLogin.ts            # Feature: Login form logic
│   ├── useClasses.ts          # Feature: Classes fetching
│   ├── useAdminDashboard.ts   # Feature: Admin dashboard data
│   ├── useParentPortal.ts     # Feature: Parent portal data
│   ├── useAuth.ts             # Shared: Auth session
│   ├── useCurrentUser.ts      # Shared: User profile
│   └── useTenant.ts           # Shared: Tenant config
│
├── schemas/                    # Centralized validation
│   ├── index.ts               # Re-exports from shared + web schemas
│   └── auth.ts                # SignupForm (web-app specific)
│
└── lib/
    ├── supabase.ts            # Supabase client
    ├── query-client.ts        # React Query setup
    └── ...
```

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
