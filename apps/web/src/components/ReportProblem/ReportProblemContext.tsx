import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canReportProblems } from '@/lib/monitoring';
import type { FeedbackKind } from '@/lib/monitoring/sendFeedback';
import { ReportProblemDialog } from './ReportProblemDialog';

type ReportProblemValue = {
  /** False for clients, students and anyone without a studio. */
  canReport: boolean;
  /** Opens "Send feedback". Pass a kind to start on it (the error screen starts on "bug"). */
  openReportProblem: (kind?: FeedbackKind) => void;
};

const ReportProblemContext = createContext<ReportProblemValue>({ canReport: false, openReportProblem: () => {} });

/**
 * "Send feedback" for studio admins. Lives at layout level (not inside the nav
 * drawer) so the dialog survives the drawer closing.
 */
export function ReportProblemProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const tenantId = user?.tenant_id ?? null;
  const canReport = canReportProblems(user?.role, tenantId);
  const [isOpen, setIsOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<FeedbackKind | null>(null);
  const openReportProblem = useCallback((kind?: FeedbackKind) => {
    setInitialKind(kind ?? null);
    setIsOpen(true);
  }, []);
  const value = useMemo(() => ({ canReport, openReportProblem }), [canReport, openReportProblem]);

  return (
    <ReportProblemContext.Provider value={value}>
      {children}
      {canReport && tenantId && (
        <ReportProblemDialog
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          tenantId={tenantId}
          initialKind={initialKind}
        />
      )}
    </ReportProblemContext.Provider>
  );
}

export function useReportProblem(): ReportProblemValue {
  return useContext(ReportProblemContext);
}
