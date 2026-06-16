import type { Engagement } from '@shared/schemas';

export interface PortalHighlightState {
  highlightPersonId?: string;
  highlightEngagementId?: string;
  enrolmentSuccess?: boolean;
}

export function buildPortalHighlightState(enrolment: Engagement): PortalHighlightState {
  return {
    highlightPersonId: enrolment.person_id,
    highlightEngagementId: enrolment.id,
    enrolmentSuccess: true,
  };
}

export function readPortalHighlightState(state: unknown): PortalHighlightState | null {
  if (!state || typeof state !== 'object') return null;
  const value = state as PortalHighlightState;
  if (!value.highlightPersonId && !value.highlightEngagementId) return null;
  return value;
}
