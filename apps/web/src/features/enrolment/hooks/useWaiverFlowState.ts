import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTenant } from '@/hooks/useTenant';
import { TenantDB } from '@/lib/db';
import { useWaiverStatus } from './useWaiverStatus';

interface UseWaiverFlowStateParams {
  enrolmentContextWaiverRequired: boolean | null | undefined;
  enrolmentContextMode: string;
  personId?: string;
  offeringId?: string;
  initialClassId?: string;
  seasonId?: string | null;
}

export function useWaiverFlowState({
  enrolmentContextWaiverRequired,
  enrolmentContextMode,
  personId,
  offeringId,
  initialClassId,
  seasonId,
}: UseWaiverFlowStateParams) {
  const tenant = useTenant();
  const { user } = useCurrentUser();

  const [localWaiverRequired, setLocalWaiverRequired] = useState<boolean | null>(null);
  const [waiverSignedInFlow, setWaiverSignedInFlow] = useState(false);
  const [waiverSignedAt, setWaiverSignedAt] = useState<string | null>(null);
  const [waiverEvidenceId, setWaiverEvidenceId] = useState<string | null>(null);

  const effectiveWaiverRequired =
    enrolmentContextWaiverRequired ?? localWaiverRequired ?? false;

  const showWaiverStep =
    effectiveWaiverRequired && enrolmentContextMode !== 'admin' && !!user;

  const { data: waiverStatus } = useWaiverStatus({
    personId,
    offeringId: offeringId ?? initialClassId,
  });

  const { data: waiverPersonDisplay } = useQuery({
    queryKey: ['waiver-person-display', tenant?.id, personId],
    queryFn: async () => {
      const { data } = await TenantDB.selectFor('people', tenant!)
        .select('name, date_of_birth')
        .eq('id', personId!)
        .maybeSingle();
      return data as { name: string; date_of_birth: string | null } | null;
    },
    enabled: !!user && !!tenant?.id && !!personId,
    staleTime: 60_000,
  });

  const { data: waiverTermDisplay } = useQuery({
    queryKey: ['waiver-term-display', tenant?.id, seasonId],
    queryFn: async () => {
      const { data } = await TenantDB.selectFor('seasons', tenant!)
        .select('name')
        .eq('id', seasonId!)
        .maybeSingle();
      return data as { name: string } | null;
    },
    enabled: !!user && !!tenant?.id && !!seasonId,
    staleTime: 60_000,
  });

  const isMinorStudent: boolean = waiverPersonDisplay?.date_of_birth
    ? new Date(waiverPersonDisplay.date_of_birth) >
      new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
    : false;

  const signerIsTheStudent: boolean = !!user?.person_id && user.person_id === personId;

  const markWaiverSigned = (evidenceId: string) => {
    setWaiverSignedInFlow(true);
    setWaiverSignedAt(new Date().toISOString());
    setWaiverEvidenceId(evidenceId);
  };

  return {
    localWaiverRequired,
    setLocalWaiverRequired,
    effectiveWaiverRequired,
    showWaiverStep,
    waiverStatus,
    waiverPersonDisplay,
    waiverTermDisplay,
    waiverSignedInFlow,
    waiverSignedAt,
    waiverEvidenceId,
    isMinorStudent,
    signerIsTheStudent,
    markWaiverSigned,
  };
}
