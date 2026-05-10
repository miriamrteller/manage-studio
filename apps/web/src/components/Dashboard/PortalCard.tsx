/**
 * PortalCard: Reusable presentational component for dashboard cards
 * 
 * Used by both AdminPanel and ParentPortal to display:
 * - Enrolment summaries
 * - Attendance records
 * - Payment information
 * - Class details
 * 
 * WCAG: Semantic card structure, proper heading levels
 */

interface PortalCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
  onClick?: () => void;
}

export function PortalCard({
  title,
  subtitle,
  children,
  variant = 'default',
  onClick,
}: PortalCardProps) {
  const variantClasses = {
    default: 'bg-white border-gray-300',
    success: 'bg-green-50 border-green-300',
    warning: 'bg-yellow-50 border-yellow-300',
    error: 'bg-red-50 border-red-300',
  };

  return (
    <article
      className={`border rounded-lg p-6 ${variantClasses[variant]} ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
      onClick={onClick}
      role={onClick ? 'button' : 'article'}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      <h3 className="font-bold text-lg mb-1">{title}</h3>
      {subtitle && <p className="text-sm text-gray-600 mb-4">{subtitle}</p>}
      <div className="text-gray-900">{children}</div>
    </article>
  );
}
