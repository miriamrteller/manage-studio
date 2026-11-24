// @vitest-environment jsdom
/**
 * URL rename (owner, 13 Nov 2026): admin addresses follow the menu (/admin/<area>/<tab>), and every
 * old address forwards to its new one, keeping the rest of the path, the query and the hash.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Forward } from '@/components/Forward';

function Where() {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="at">{`${pathname}${search}${hash}`}</p>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/admin/students/*" element={<Forward from="/admin/students" to="/admin/people" />} />
        <Route path="/admin/jobs/*" element={<Forward from="/admin/jobs" to="/admin/projects" />} />
        <Route path="/admin/setup/settings" element={<Forward from="/admin/setup/settings" to="/admin/settings" />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('old admin addresses forward to the new ones', () => {
  it('keeps the rest of the path', () => {
    renderAt('/admin/students/0b6c6e7f');
    expect(screen.getByTestId('at').textContent).toBe('/admin/people/0b6c6e7f');
  });

  it('keeps the query and the hash (links in emails already sent)', () => {
    renderAt('/admin/jobs/j1?tab=gallery#top');
    expect(screen.getByTestId('at').textContent).toBe('/admin/projects/j1?tab=gallery#top');
  });

  it('keeps a Settings tab', () => {
    renderAt('/admin/setup/settings?tab=legal');
    expect(screen.getByTestId('at').textContent).toBe('/admin/settings?tab=legal');
  });
});
