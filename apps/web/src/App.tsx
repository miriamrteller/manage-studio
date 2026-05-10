import { RouterProvider } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { QueryClientProvider } from '@tanstack/react-query'
import i18n from './i18n/i18n'
import router from './router'
import queryClient from './lib/query-client'

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </QueryClientProvider>
  )
}
