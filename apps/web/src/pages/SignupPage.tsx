import { useTranslation } from 'react-i18next'

export default function SignupPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-[#76335a] mb-8 text-center">
          {t('pages.signup')}
        </h1>
        <p className="text-gray-600 text-center">{t('pages.coming_soon_phase1a')}</p>
      </div>
    </main>
  )
}
