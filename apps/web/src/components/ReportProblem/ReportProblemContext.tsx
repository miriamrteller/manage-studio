import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { canReportProblems } from '@/lib/monitoring';
import { ReportProblemDialog } from './ReportProblemDialog';

type ReportProblemValue = {
  /** False for clients/students, and whenever error reporting is not configured. */
  canReport: boolean;
  openReportProblem: () => void;
};

const ReportProblemContext = createContext<ReportProblemValue>({ canReport: false, openReportProblem: () => {} });

/**
 * "Report a problem" for studio admins. Lives at layout level (not inside the nav
 * drawer) so the dialog survives the drawer closing.
 */
export function ReportProblemProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const canReport = canReportProblems(user?.role);
  const [isOpen, setIsOpen] = useState(false);
  const openReportProblem = useCallback(() => setIsOpen(true), []);
  const value = useMemo(() => ({ canReport, openReportProblem }), [canReport, openReportProblem]);

  return (
    <ReportProblemContext.Provider value={value}>
      {children}
      {canReport && <ReportProblemDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </ReportProblemContext.Provider>
  );
}

export function useReportProblem(): ReportProblemValue {
  return useContext(ReportProblemContext);
}
