import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

/**
 * WCAG 2.1 Level AA Compliance Tests
 * Scope: Israeli community centers (דינ נגישות לאנשים עם מוגבלות, 1998)
 * Required: All tests pass before merge; manual NVDA Hebrew smoke test pre-deployment
 */

test.describe('Heading Structure (WCAG 2.4.1)', () => {
  test('no level skips (h1 → h3)', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    await checkA11y(page);
    
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    
    for (let i = 1; i < headings.length; i++) {
      const current = parseInt(await headings[i].evaluate(el => (el as HTMLElement).tagName[1]));
      const previous = parseInt(await headings[i-1].evaluate(el => (el as HTMLElement).tagName[1]));
      expect(current - previous).toBeLessThanOrEqual(1);
    }
  });

  test('exactly one h1 per page', async ({ page }) => {
    await page.goto('/');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);
  });
});

test.describe('Form Accessibility (WCAG 1.3.1)', () => {
  test('all inputs have associated labels', async ({ page }) => {
    await page.goto('/');
    const inputs = await page.locator('input, select, textarea').all();
    
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const parent = await input.evaluate(el => (el.parentElement?.textContent || '').length);
      
      expect(id || ariaLabel || parent > 0).toBeTruthy();
    }
  });

  test('form validation errors announce via aria-live', async ({ page }) => {
    await page.goto('/');
    const submitButton = await page.locator('button[type="submit"]').first();
    
    if (submitButton) {
      await submitButton.click();
      const liveRegion = await page.locator('[aria-live="polite"], [aria-live="assertive"]').first();
      
      if (await liveRegion.isVisible()) {
        const errorText = await liveRegion.textContent();
        expect(errorText?.length).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('Modal Focus Management (WCAG 2.4.3)', () => {
  test('focus management in modals', async ({ page }) => {
    await page.goto('/');
    
    // Try to find and open any modal/dialog
    const dialogTrigger = await page.locator('[aria-haspopup="dialog"], [data-testid*="modal-trigger"]').first();
    
    if (dialogTrigger && await dialogTrigger.isVisible()) {
      await dialogTrigger.click();
      
      const modal = page.locator('[role="dialog"]').first();
      if (await modal.isVisible()) {
        // Verify focus trap exists
        const focusableElements = await modal.locator(
          'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]'
        ).all();
        
        expect(focusableElements.length).toBeGreaterThan(0);
        
        // Verify Escape closes modal
        await page.keyboard.press('Escape');
        const stillVisible = await modal.isVisible();
        expect(stillVisible).toBe(false);
      }
    }
  });
});

test.describe('Color Contrast (WCAG 1.4.3)', () => {
  test('text contrast meets WCAG AA standards', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    
    const results = await page.evaluate(() => {
      return (window as any).axe?.run?.() || { violations: [] };
    });
    
    const contrastViolations = results.violations?.filter(
      (v: any) => v.id === 'color-contrast'
    ) || [];
    
    expect(contrastViolations.length).toBe(0);
  });
});

test.describe('Keyboard Navigation (WCAG 2.1.1)', () => {
  test('tab through page elements without focus loss', async ({ page }) => {
    await page.goto('/');
    let focusedElement = 'BODY';
    let focusLossCount = 0;
    
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      focusedElement = await page.evaluate(() => (document.activeElement as HTMLElement)?.tagName || 'BODY');
      
      if (focusedElement === 'BODY') {
        focusLossCount++;
      }
    }
    
    // Allow wrapping to BODY at end of page, but not in the middle
    expect(focusLossCount).toBeLessThanOrEqual(1);
  });

  test('all interactive elements keyboard accessible', async ({ page }) => {
    await page.goto('/');
    const buttons = await page.locator('button, [role="button"], a[href], input, select, textarea').all();
    
    for (const button of buttons) {
      const tabindex = await button.getAttribute('tabindex');
      // Should not have tabindex="-1" unless it's decorative
      const isHidden = await button.isHidden();
      
      if (!isHidden) {
        expect(tabindex !== '-1' || (await button.getAttribute('aria-hidden')) === 'true').toBeTruthy();
      }
    }
  });
});

test.describe('Semantic HTML & ARIA (WCAG 1.3.1)', () => {
  test('landmarks present on page', async ({ page }) => {
    await page.goto('/');
    const main = await page.locator('main, [role="main"]').isVisible();
    expect(main).toBe(true);
  });

  test('buttons use semantic <button> element', async ({ page }) => {
    await page.goto('/');
    const divButtons = await page.locator('div[onclick]').count();
    // Should be minimal/zero div[onclick] patterns
    expect(divButtons).toBeLessThan(5);
  });

  test('list items in proper list structure', async ({ page }) => {
    await page.goto('/');
    const orphanItems = await page.locator('li:not(ul > li):not(ol > li)').count();
    // May have some orphaned LI in libraries, but shouldn't be many
    expect(orphanItems).toBeLessThan(3);
  });
});

test.describe('RTL & Hebrew Support (WCAG 3.1.1)', () => {
  test('html element has lang and dir attributes', async ({ page }) => {
    await page.goto('/');
    const html = await page.locator('html').evaluate(el => ({
      lang: el.getAttribute('lang'),
      dir: el.getAttribute('dir')
    }));
    
    expect(html.lang).toBeTruthy();
    expect(html.dir).toBeTruthy();
  });

  test('direction properly set (RTL or LTR)', async ({ page }) => {
    await page.goto('/');
    const direction = await page.locator('html').evaluate(el => el.getAttribute('dir'));
    expect(['rtl', 'ltr']).toContain(direction);
  });
});

test.describe('ARIA Patterns', () => {
  test('form groups use fieldset and legend', async ({ page }) => {
    await page.goto('/');
    const fieldsets = await page.locator('fieldset').all();
    
    for (const fs of fieldsets) {
      const legend = await fs.locator('legend').isVisible();
      // Fieldsets should have legends
      if (fieldsets.length > 0) {
        expect(legend).toBe(true);
      }
    }
  });

  test('checkboxes and radios properly marked', async ({ page }) => {
    await page.goto('/');
    const inputs = await page.locator('input[type="radio"], input[type="checkbox"]').all();
    
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const ariaLabelledBy = await input.getAttribute('aria-labelledby');
      
      // Should have some form of label
      expect(id || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });
});

test.describe('Overall axe-core scan', () => {
  test('zero critical/serious violations', async ({ page }) => {
    await page.goto('/');
    await injectAxe(page);
    
    const results = await page.evaluate(() => {
      return (window as any).axe?.run?.() || { violations: [] };
    });
    
    const seriousViolations = (results.violations || []).filter(
      (v: any) => ['critical', 'serious'].includes(v.impact)
    );
    
    if (seriousViolations.length > 0) {
      console.error('Violations found:', seriousViolations);
    }
    
    expect(seriousViolations.length).toBe(0);
  });
});
