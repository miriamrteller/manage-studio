import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AA, WHITE, contrast } from '@/lib/theme/color';
import { deriveSoftTheme } from '@/lib/theme/deriveSoftTheme';
import { deriveButtonGradient } from '@/lib/theme/buttonGradient';
import { defaultThemeTokens, getDefaultTheme } from '@/lib/theme/defaultTheme';
import { Alert } from '@/components/ui/alert';
import { AuthMessage } from '@/components/shared/AuthMessage';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

const COLOURS = ['#ffffff', '#000000', '#ffff00', '#00ffff', '#ff0000', '#76335a', '#5b6cff', '#21d1c2', '#9333d6'];
const endpoints = (g: ReturnType<typeof deriveButtonGradient>, fill: string) => [
  fill, g['--color-primary-fill-end'], g['--color-primary-fill-end-hover'],
];

describe('primary button gradient', () => {
  it('OpalSwift default runs fill -> a purple-shifted deeper shade, white text AA at both ends and on hover', () => {
    const t = defaultThemeTokens();
    expect(t['--gradient-primary']).toBe(`linear-gradient(135deg, #4a58e8, ${t['--color-primary-fill-end']})`);
    expect(t['--color-primary-fill-end']).not.toBe('#4a58e8');
    for (const bg of [t['--color-primary-fill'], t['--color-primary-fill-end'], t['--color-primary-fill-end-hover']]) {
      expect(contrast(WHITE, bg)).toBeGreaterThanOrEqual(AA);
    }
    expect(getDefaultTheme().gradientAnchor).toBe('#9333D6');
  });

  it('keeps the label AA at every endpoint for any studio colours', () => {
    for (const primary of COLOURS) {
      for (const accent of COLOURS) {
        const soft = deriveSoftTheme(primary, accent);
        const fill = soft['--color-primary-fill'];
        const on = soft['--color-on-primary-fill'];
        const g = deriveButtonGradient(fill, on, accent);
        for (const bg of endpoints(g, fill)) {
          expect(contrast(on, bg), `${primary}/${accent} on ${bg}`).toBeGreaterThanOrEqual(AA);
        }
      }
    }
  });

  it("derives from the studio's own colours (not the OpalSwift purple)", () => {
    const soft = deriveSoftTheme('#76335a', '#e99ac4');
    const own = deriveButtonGradient(soft['--color-primary-fill'], soft['--color-on-primary-fill'], '#e99ac4');
    const opal = deriveButtonGradient('#76335a', '#ffffff', '#9333d6');
    expect(own['--color-primary-fill-end']).not.toBe(opal['--color-primary-fill-end']);
  });

  it('Solid chrome is flat', () => {
    const g = deriveButtonGradient('#4a58e8', '#ffffff', '#9333d6', true);
    expect(g['--gradient-primary']).toBe('none');
    expect(g['--gradient-primary-hover']).toBe('none');
  });

  it('primary Button paints the gradient with hover and disabled states', () => {
    render(<Button variant="primary" disabled>Send Link</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('var(--gradient-primary)');
    expect(cls).toContain('hover:[background-image:var(--sheen-soft),var(--gradient-primary-hover)]');
    expect(cls).toContain('disabled:');
    expect(cls).toContain('focus-visible:outline');
  });
});

describe('alert', () => {
  it('renders the message in one box (the message is not wrapped in another box)', () => {
    const { container } = render(<AuthMessage type="success" text="Check your email for a sign-in link." />);
    const box = screen.getByRole('status');
    expect(box).toHaveTextContent('Check your email for a sign-in link.');
    // exactly one bordered, rounded box, and no button/pill around it
    expect(container.querySelectorAll('[class*="border-"]').length).toBe(1);
    expect(container.querySelector('button')).toBeNull();
    expect(box.className).toContain('rounded-lg');
  });

  it('error variant is an assertive alert in one box', () => {
    const { container } = render(<AuthMessage type="error" text="Invalid login" />);
    const box = screen.getByRole('alert');
    expect(box).toHaveAttribute('aria-live', 'assertive');
    expect(box.className).toContain('bg-red-50');
    expect(container.querySelectorAll('[class*="border-"]').length).toBe(1);
  });

  it('has success, error, info variants and a dismiss button inside the box', () => {
    const onDismiss = vi.fn();
    render(<Alert variant="info" onDismiss={onDismiss} dismissLabel="Dismiss message">Heads up</Alert>);
    const box = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(onDismiss).toHaveBeenCalled();
    expect(box).toContainElement(screen.getByRole('button', { name: 'Dismiss message' }));
  });
});

describe('tabs', () => {
  it('uses a straight underline: no radius, active tab marked with the brand ink', () => {
    render(
      <Tabs value="b" onValueChange={() => {}}>
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const active = screen.getByRole('tab', { name: 'B' });
    expect(active).toHaveAttribute('aria-selected', 'true');
    expect(active.className).toContain('rounded-none');
    expect(active.className).toContain('border-b-2');
    expect(active.className).toContain('--color-primary-ink');
    // direction-neutral spacing (gap, not space-x) so RTL is mirrored
    expect(screen.getByRole('tablist').className).toContain('gap-1');
    expect(screen.getByRole('tablist').className).not.toContain('space-x');
  });
});
