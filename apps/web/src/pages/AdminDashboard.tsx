import { useTranslation } from 'react-i18next'

export default function AdminDashboard() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-primary mb-8">{t('pages.admin_dashboard')}</h1>
        <p className="text-gray-600">{t('pages.coming_soon_admin')}</p>
      </div>
    </main>
  )
}
