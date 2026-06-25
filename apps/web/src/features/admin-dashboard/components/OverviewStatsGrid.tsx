import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

interface OverviewStatsGridProps {
  termEnrolments: number;
  outstandingPayments: number;
  adminReviewCount: number;
  /** Revenue in minor currency units (agorot / cents). */
  revenueMTD: number;
  /** ISO 4217 currency code. Default: 'ILS' */
  currencyCode?: string;
  isLoading: boolean;
  className?: string;
}

const formatCurrency = (minor: number, code: string) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100);

export const OverviewStatsGrid = ({
  termEnrolments,
  outstandingPayments,
  adminReviewCount,
  revenueMTD,
  currencyCode = 'ILS',
  isLoading,
  className = '',
}: OverviewStatsGridProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className={`grid grid-cols-2 gap-4 md:grid-cols-4 ${className}`}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-lg border border-gray-200 bg-gray-50"
            data-testid="skeleton"
          />
        ))}
      </div>
    );
  }

  const cards = [
    {
      key: 'term_enrolments' as const,
      label: t('pages.admin.overview.term_enrolments'),
      value: termEnrolments,
      path: '/admin/students',
    },
    {
      key: 'outstanding_payments' as const,
      label: t('pages.admin.overview.outstanding_payments'),
      value: outstandingPayments,
      path: '/admin/finance',
    },
    {
      key: 'admin_review_queue' as const,
      label: t('pages.admin.overview.admin_review_queue'),
      value: adminReviewCount,
      path: '/admin/students?status=admin_review',
    },
    {
      key: 'revenue_mtd' as const,
      label: t('pages.admin.overview.revenue_mtd'),
      value: formatCurrency(revenueMTD, currencyCode),
      path: '/admin/finance',
    },
  ];

  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-4 ${className}`}>
      {cards.map((card) => (
        <div
          key={card.key}
          className="cursor-pointer rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md"
          onClick={() => navigate(card.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(card.path)}
        >
          <div className="mb-1 text-sm text-gray-600">{card.label}</div>
          <div className="text-2xl font-bold text-gray-900">{card.value}</div>
        </div>
      ))}
    </div>
  );
};
