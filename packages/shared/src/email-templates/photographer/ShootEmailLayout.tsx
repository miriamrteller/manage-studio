import React from 'react';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from '../BaseEmailTemplate.js';
import { EmailDetailsTable, EmailMutedText, EmailParagraph, EmailPrimaryButton } from '../primitives/index.js';
import { interpolateTemplate } from '../../i18n/email.js';

/**
 * Shared body for the photographer automatic emails (quote sent, booking
 * confirmed, shoot reminder, thank-you, gallery ready). Every value is a
 * plain string so the Deno shell builder can swap in {{MS_*}} placeholders.
 */
export interface ShootEmailCommonProps {
  schoolName: string;
  schoolLogoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: Record<string, unknown>;
}

export interface ShootEmailRow {
  labelKey: string;
  value: string;
}

interface ShootEmailLayoutProps extends ShootEmailCommonProps {
  defaults: Record<string, string>;
  values: Record<string, string>;
  rows?: ShootEmailRow[];
  ctaHref?: string;
}

function pick(strings: Record<string, unknown> | undefined, defaults: Record<string, string>, key: string): string {
  const value = strings?.[key];
  return typeof value === 'string' ? value : defaults[key] ?? '';
}

export default function ShootEmailLayout({
  schoolName,
  schoolLogoUrl,
  language,
  colors,
  footerStrings,
  strings,
  defaults,
  values,
  rows = [],
  ctaHref,
}: ShootEmailLayoutProps) {
  const vars = { schoolName, ...values };
  const s = (key: string) => interpolateTemplate(pick(strings, defaults, key), vars);

  return (
    <BaseEmailTemplate
      previewText={s('preview')}
      schoolName={schoolName}
      schoolLogoUrl={schoolLogoUrl}
      language={language}
      colors={colors}
      footerStrings={footerStrings}
    >
      <EmailParagraph>{s('greeting')}</EmailParagraph>
      <EmailParagraph>{s('body')}</EmailParagraph>
      {rows.length > 0 && (
        <EmailDetailsTable
          heading={s('details_heading')}
          rows={rows.map((row) => ({ label: s(row.labelKey), value: row.value }))}
        />
      )}
      {ctaHref && <EmailPrimaryButton href={ctaHref}>{s('cta')}</EmailPrimaryButton>}
      <EmailMutedText>{s('closing')}</EmailMutedText>
    </BaseEmailTemplate>
  );
}
