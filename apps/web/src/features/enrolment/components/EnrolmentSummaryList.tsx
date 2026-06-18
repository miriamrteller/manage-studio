import { EnrolmentStatusAction, type EnrolmentLinkContext } from '@/features/enrolment/components/EnrolmentStatusAction';
import type { StudentEnrolmentSummary } from '@/features/enrolment/lib/enrolmentFilterOptions';

interface EnrolmentSummaryListProps {
  enrolments: StudentEnrolmentSummary[];
  returnTo?: string;
  compact?: boolean;
  audience?: 'parent' | 'admin';
  linkContext?: Omit<EnrolmentLinkContext, 'className'>;
}

/** Class enrolment rows with status chip or completion action when pending. */
export function EnrolmentSummaryList({
  enrolments,
  returnTo,
  compact = false,
  audience = 'parent',
  linkContext,
}: EnrolmentSummaryListProps) {
  if (enrolments.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>;
  }

  return (
    <ul className={compact ? 'flex flex-col gap-1' : 'space-y-2'}>
      {enrolments.map((enrolment) => (
        <li
          key={enrolment.id}
          className={
            compact
              ? 'flex flex-wrap items-center justify-between gap-x-2 gap-y-1'
              : 'flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-white px-2 py-1.5'
          }
        >
          <span className={compact ? 'text-xs text-gray-700' : 'text-sm font-medium text-gray-900'}>
            {enrolment.className}
          </span>
          <EnrolmentStatusAction
            status={enrolment.status}
            engagementId={enrolment.id}
            size="sm"
            returnTo={returnTo}
            audience={audience}
            linkContext={
              linkContext
                ? {
                    ...linkContext,
                    className: enrolment.className,
                  }
                : undefined
            }
          />
        </li>
      ))}
    </ul>
  );
}
