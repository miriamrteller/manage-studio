import { useTranslation } from 'react-i18next'

export default function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
      <p className="text-gray-600 text-lg">{t('error.not_found')}</p>
    </main>
  )
}
