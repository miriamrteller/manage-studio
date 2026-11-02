import React from 'react';
import BaseEmailTemplate, { type EmailColorConfig, type EmailFooterStrings } from './BaseEmailTemplate.js';
import {
  EmailLinkBox,
  EmailMutedText,
  EmailParagraph,
  EmailPrimaryButton,
  EmailWarningText,
} from './primitives/index.js';

/**
 * Sent once, when the platform creates a studio and invites its owner
 * (provision-studio → Supabase "invite" → send-auth-email). OpalSwift-branded:
 * the header is OpalSwift's, the studio's name is in the body.
 */
export interface StudioOwnerWelcomeEmailProps {
  studioName: string;
  /** e.g. https://<subdomain>.opalswift.com */
  studioUrl: string;
  /** The invite link ("Set up your account"). */
  inviteUrl: string;
  logoUrl?: string;
  language: 'en' | 'he';
  colors?: EmailColorConfig;
  footerStrings?: EmailFooterStrings;
  strings?: Record<string, unknown>;
}

const DEFAULT_STRINGS = {
  preview: 'Your studio {studioName} is ready on OpalSwift',
  greeting: 'Welcome to OpalSwift!',
  intro: 'Your studio {studioName} is ready. Set up your account to get started.',
  studio_address_label: 'Your studio address:',
  cta_button: 'Set up your account',
  next_heading: "What's next",
  next_step_1: 'Sign in to your studio.',
  next_step_2: 'Add your logo and your classes or services.',
  next_step_3: 'Invite your first clients or families.',
  fallback_text: "If the button above doesn't work, copy and paste this link into your browser:",
  expiration_notice: 'This link works for 1 hour. After that, sign in at your studio address with this email.',
  questions: 'Questions? Just reply to this email.',
  footer_notice: 'You are receiving this email because a studio was created for you on OpalSwift.',
};

function text(strings: Record<string, unknown>, key: keyof typeof DEFAULT_STRINGS): string {
  const value = strings[key];
  return typeof value === 'string' && value ? value : DEFAULT_STRINGS[key];
}

export default function StudioOwnerWelcomeEmail({
  studioName,
  studioUrl,
  inviteUrl,
  logoUrl,
  language,
  colors,
  footerStrings,
  strings = {},
}: StudioOwnerWelcomeEmailProps) {
  const withStudio = (value: string) => value.split('{studioName}').join(studioName);
  const steps = [text(strings, 'next_step_1'), text(strings, 'next_step_2'), text(strings, 'next_step_3')];

  return (
    <BaseEmailTemplate
      previewText={withStudio(text(strings, 'preview'))}
      schoolName="OpalSwift"
      schoolLogoUrl={logoUrl}
      language={language}
      colors={colors}
      // The footer's "do not reply" line would contradict "just reply" here.
      footerStrings={{ ...footerStrings, automated_notice: text(strings, 'footer_notice') }}
    >
      <EmailParagraph style={{ fontWeight: 600, fontSize: '18px' }}>
        {text(strings, 'greeting')}
      </EmailParagraph>
      <EmailParagraph>{withStudio(text(strings, 'intro'))}</EmailParagraph>

      <EmailParagraph>
        {text(strings, 'studio_address_label')}{' '}
        <a href={studioUrl} dir="ltr" style={{ color: 'var(--email-primary)', fontWeight: 600 }}>
          {studioUrl}
        </a>
      </EmailParagraph>

      <EmailPrimaryButton href={inviteUrl}>{text(strings, 'cta_button')}</EmailPrimaryButton>

      <EmailParagraph style={{ fontWeight: 600, marginTop: '8px' }}>
        {text(strings, 'next_heading')}
      </EmailParagraph>
      <ol style={{ margin: '0 0 20px', paddingInlineStart: '24px' }}>
        {steps.map((step) => (
          <li key={step} style={{ marginBottom: '6px' }}>
            {step}
          </li>
        ))}
      </ol>

      <EmailWarningText>{text(strings, 'expiration_notice')}</EmailWarningText>
      <EmailMutedText>{text(strings, 'fallback_text')}</EmailMutedText>
      <EmailLinkBox href={inviteUrl} />

      <EmailParagraph style={{ marginTop: '24px' }}>{text(strings, 'questions')}</EmailParagraph>
    </BaseEmailTemplate>
  );
}
