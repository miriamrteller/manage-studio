/**
 * COMPONENT & HOOK TESTING GUIDE
 * 
 * This file documents testing patterns for the refactored architecture.
 * All hooks and smart components should include unit and integration tests.
 */

/**
 * TESTING PATTERNS
 * 
 * 1. HOOK TESTS (src/hooks/*.test.ts)
 * 
 * Test business logic in isolation:
 * - Input validation (Zod schemas)
 * - API call handling
 * - State management
 * - Error scenarios
 * - Loading states
 * 
 * Example: useLogin.test.ts
 * ✓ Should validate email with Zod schema
 * ✓ Should call supabase.auth.signInWithOtp with correct params
 * ✓ Should set error message on failure
 * ✓ Should set success message on success
 * ✓ Should reset message on resetMessage()
 * ✓ Should call onSuccess callback after successful submission
 * ✓ Should handle network errors gracefully
 * 
 * 2. SMART COMPONENT TESTS (src/components/[Feature]/*.test.tsx)
 * 
 * Test component logic and hook integration:
 * - Hook rendering and state changes
 * - Conditional rendering (loading, error, empty, success)
 * - Props passing to child components
 * - Accessibility (ARIA attributes, roles)
 * 
 * Example: ClassesList.test.tsx
 * ✓ Should display loading state when isLoading=true
 * ✓ Should display error state when error exists
 * ✓ Should display empty state when classes=[]
 * ✓ Should render ClassCard for each class
 * ✓ Should have role="list" on classes container
 * ✓ Should have aria-live="polite" on loading state
 * 
 * 3. PRESENTATIONAL COMPONENT TESTS (src/components/[Feature]/*.test.tsx)
 * 
 * Test UI rendering only:
 * - Props rendering (text, images, etc.)
 * - Event handlers (onClick, onChange, etc.)
 * - CSS classes based on props
 * - Accessibility (labels, ARIA, keyboard nav)
 * 
 * Example: ClassCard.test.tsx
 * ✓ Should render class name
 * ✓ Should render class time
 * ✓ Should format price correctly
 * ✓ Should call handleEnrol on button click
 * ✓ Should have proper aria-label on button
 * 
 * 4. COMMON COMPONENT TESTS (src/components/Common/*.test.tsx)
 * 
 * Test variants, sizes, states:
 * 
 * Example: Button.test.tsx
 * ✓ Should render primary variant by default
 * ✓ Should apply secondary variant styles
 * ✓ Should apply outline variant styles
 * ✓ Should render loading spinner when isLoading=true
 * ✓ Should be disabled when disabled=true
 * ✓ Should be fullWidth when fullWidth=true
 * ✓ Should have focus indicator (outline-2)
 * 
 * SETUP
 * 
 * Install testing libraries:
 * pnpm add -D -w vitest @testing-library/react @testing-library/dom
 * 
 * Create vitest.config.ts in apps/web/
 * Create test setup file (e.g., src/test/setup.ts)
 * 
 * RUNNING TESTS
 * 
 * pnpm run test              # Run all tests once
 * pnpm run test:watch        # Watch mode
 * pnpm run test:coverage     # Coverage report
 * 
 * COVERAGE TARGETS
 * 
 * Minimum coverage:
 * - Functions: 80%
 * - Lines: 80%
 * - Branches: 75%
 * - Statements: 80%
 * 
 * By feature:
 * - hooks/: 90% (business logic)
 * - components/[Feature]/: 85% (smart components)
 * - components/Common/: 90% (heavily reused)
 * - pages/: 70% (mostly composition, hard to test)
 * 
 * MOCKING STRATEGY
 * 
 * Mock external dependencies:
 * - Supabase client calls
 * - React Query hooks
 * - Router navigation
 * - i18n translations
 * 
 * Example: useClasses.test.ts
 * Mock useQuery and supabase.from().select()
 * Test return value against various scenarios
 * 
 * Test with React Testing Library:
 * - Render component
 * - Check rendered output
 * - Simulate user interactions
 * - Verify hook behavior
 */

export const testPatterns = {
  hooks: {
    validate: 'Input validation with Zod',
    apiCalls: 'Supabase/API call handling',
    state: 'State management (loading, error, data)',
    errors: 'Error scenarios and handling',
    callbacks: 'Callback invocation (onSuccess, etc.)',
  },
  smartComponents: {
    hookIntegration: 'Hook rendering and state changes',
    loading: 'Loading state display',
    error: 'Error state display',
    empty: 'Empty state display',
    success: 'Success state with data rendering',
    childProps: 'Props passing to child components',
    accessibility: 'ARIA attributes and roles',
  },
  presentationalComponents: {
    propsRendering: 'Props rendering (text, images)',
    eventHandlers: 'Event handler invocation',
    styling: 'CSS classes based on props',
    variants: 'Component variants and sizes',
    states: 'Disabled, loading, error states',
    accessibility: 'Labels, ARIA, keyboard navigation',
  },
};
