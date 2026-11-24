import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { FEATURES } from '@shared/index';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTenant } from '@/hooks/useTenant';
import { helpTopicsFor } from '@/features/help/helpTopics';
import { AssistantPanel } from './AssistantPanel';
import { TourOverlay } from './TourOverlay';
import type { AskResult } from './askAssistant';

/** One question and what came back (a reply or an error code). */
export interface AssistantExchange {
  id: number;
  question: string;
  result: AskResult | null;
}

export interface ActiveTour {
  guideId: string;
  index: number;
}

type AssistantValue = {
  /** Studio admins whose studio has the feature on and has guides. */
  canAsk: boolean;
  openAssistant: () => void;
  startTour: (guideId: string) => void;
};

const AssistantContext = createContext<AssistantValue>({
  canAsk: false,
  openAssistant: () => {},
  startTour: () => {},
});

const TOUR_KEY = 'opalswift.assistant.tour';

function readTour(): ActiveTour | null {
  try {
    const raw = sessionStorage.getItem(TOUR_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ActiveTour>;
    return typeof value.guideId === 'string' && typeof value.index === 'number'
      ? { guideId: value.guideId, index: value.index }
      : null;
  } catch {
    return null;
  }
}

function writeTour(tour: ActiveTour | null) {
  try {
    if (tour) sessionStorage.setItem(TOUR_KEY, JSON.stringify(tour));
    else sessionStorage.removeItem(TOUR_KEY);
  } catch {
    // Private mode: the tour still runs, it just won't survive a reload.
  }
}

/**
 * "Ask OpalSwift" (feature platform:assistant.help, off unless switched on per studio).
 * Read-only: it answers from the help guides, can walk a guide as a tour and can fill
 * a form in, but the admin always presses Save or Create themself.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  const tenant = useTenant();
  const { hasFeature } = useFeatureGate();
  const roles = user?.role ?? [];
  const isAdmin = roles.includes('tenant_admin') || roles.includes('super_admin');
  const canAsk =
    isAdmin &&
    !!user?.tenant_id &&
    hasFeature(FEATURES.platform.assistantHelp) &&
    helpTopicsFor(tenant?.vertical).length > 0;

  const [isOpen, setIsOpen] = useState(false);
  const [exchanges, setExchanges] = useState<AssistantExchange[]>([]);
  const [tour, setTourState] = useState<ActiveTour | null>(readTour);

  const setTour = useCallback((next: ActiveTour | null) => {
    writeTour(next);
    setTourState(next);
  }, []);
  const openAssistant = useCallback(() => setIsOpen(true), []);
  const startTour = useCallback(
    (guideId: string) => {
      setIsOpen(false);
      setTour({ guideId, index: 0 });
    },
    [setTour],
  );

  const value = useMemo(() => ({ canAsk, openAssistant, startTour }), [canAsk, openAssistant, startTour]);

  return (
    <AssistantContext.Provider value={value}>
      {children}
      {canAsk && (
        <AssistantPanel
          isOpen={isOpen}
          onOpen={() => setIsOpen(true)}
          onClose={() => setIsOpen(false)}
          exchanges={exchanges}
          setExchanges={setExchanges}
          onShowMe={startTour}
        />
      )}
      {canAsk && tour && <TourOverlay tour={tour} onChange={setTour} />}
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantValue {
  return useContext(AssistantContext);
}
