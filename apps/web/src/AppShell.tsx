import { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { LanguageProvider } from './contexts/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import i18n from './i18n/i18n';
import queryClient from './lib/query-client';
import { useThemeInjection } from './hooks/useThemeInjection';

function ThemeInjector() {
  useThemeInjection();
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <LanguageProvider>
          <ErrorBoundary>
            <ThemeInjector />
            {children}
          </ErrorBoundary>
        </LanguageProvider>
      </I18nextProvider>
    </QueryClientProvider>
  );
}
