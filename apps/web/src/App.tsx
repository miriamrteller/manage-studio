import { RouterProvider } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from './i18n/i18n'
import router from './router'
import queryClient from './lib/query-client'
import { useThemeInjection } from './hooks/useThemeInjection'
import { LanguageProvider } from './contexts/LanguageContext'
import { ErrorBoundary } from './components/ErrorBoundary'

function AppContent() {
  // Inject tenant's theme (colors, logo) at app root
  useThemeInjection()
  return null;
}

export default function App() {
  return (
    <RouterProvider router={router}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <LanguageProvider>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </LanguageProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </RouterProvider>
  )
}
