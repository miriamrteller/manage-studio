import React from 'react';
import { Button } from '@react-email/components';
import { emailButtonPrimary } from './styles.js';
import { emailGradient } from '../../email/brand.js';
import { useEmailBrand } from './brand.js';

interface EmailPrimaryButtonProps {
  href: string;
  children: React.ReactNode;
}

/**
 * With a brand gradient (auth emails): a bulletproof button. A table cell carries
 * the solid `bgcolor` (what Outlook and gradient-less clients show) plus the CSS
 * gradient, and the link inside fills it. White text is AA on the solid fill and
 * on the gradient end. Otherwise the flat primary-colour button.
 */
export function EmailPrimaryButton({ href, children }: EmailPrimaryButtonProps) {
  const brand = useEmailBrand();
  if (brand) {
    return (
      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        align="center"
        style={{ margin: '0 auto 28px', borderCollapse: 'separate' }}
      >
        <tbody>
          <tr>
            <td
              align="center"
              // @ts-expect-error legacy attribute, kept for Outlook
              bgcolor={brand.fill}
              style={{
                backgroundColor: brand.fill,
                backgroundImage: emailGradient(brand),
                borderRadius: '8px',
              }}
            >
              <a
                href={href}
                style={{
                  display: 'inline-block',
                  padding: '14px 36px',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '16px',
                  lineHeight: '1.2',
                  textDecoration: 'none',
                  borderRadius: '8px',
                }}
              >
                {children}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
  return (
    <div style={{ marginBottom: '28px', textAlign: 'center' }}>
      <Button href={href} style={emailButtonPrimary}>
        {children}
      </Button>
    </div>
  );
}
