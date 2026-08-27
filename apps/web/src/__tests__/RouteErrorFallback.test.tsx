// @vitest-environment jsdom
/**
 * A page that throws during render is replaced by RouteErrorFallback inside
 * the layout's outlet (pathless errorElement wrapper, as wired in router.tsx),
 * so the surrounding layout — header, nav — keeps rendering.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { RouteErrorFallback } from '../components/RouteErrorFallback';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

function Layout() {
  return (
    <div>
      <nav>layout-nav</nav>
      <Outlet />
    </div>
  );
}

function CrashingPage(): never {
  throw new Error('Cannot read properties of undefined');
}

beforeEach(() => {
  // React logs the thrown render error; keep test output clean.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RouteErrorFallback', () => {
  it('shows the fallback inside the layout when a page throws', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Layout />,
          children: [
            {
              errorElement: <RouteErrorFallback />,
              children: [
                { index: true, element: <div>home</div> },
                { path: 'crash', element: <CrashingPage /> },
              ],
            },
          ],
        },
      ],
      { initialEntries: ['/crash'] },
    );

    render(<RouterProvider router={router} />);

    // The layout survives — navigation stays usable.
    expect(screen.getByText('layout-nav')).toBeTruthy();
    // The fallback replaces only the page.
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('errors.page_crashed_title')).toBeTruthy();
    expect(screen.getByText('Cannot read properties of undefined')).toBeTruthy();
    expect(screen.getByText('common.back')).toBeTruthy();
    expect(screen.getByText('common.home')).toBeTruthy();
  });
});
