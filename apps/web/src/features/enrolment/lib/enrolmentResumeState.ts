import { supabase } from '@/lib/supabase';

const STORAGE_PREFIX = 'enrolment-resume:';

export interface EnrolmentResumeState {
  version: 1;
  savedAt: string;
  expiresAt: string;
  route: string;
  step: string;
  engagementId?: string;
  enrolmentToken?: string;
  formData: Record<string, unknown>;
  selectedIds: {
    personId?: string;
    classId?: string;
    seasonId?: string;
  };
  uiState: {
    waiverComplete?: boolean;
    paymentIntentReady?: boolean;
    scrollOffsets?: Record<string, number>;
  };
}

function storageKey(resumeKey: string): string {
  return `${STORAGE_PREFIX}${resumeKey}`;
}

export function createResumeKey(): string {
  return crypto.randomUUID();
}

export async function saveEnrolmentResume(
  resumeKey: string,
  tenantSubdomain: string,
  state: EnrolmentResumeState,
): Promise<void> {
  sessionStorage.setItem(storageKey(resumeKey), JSON.stringify(state));
  await supabase.functions.invoke('save-enrolment-resume', {
    body: {
      resumeKey,
      tenantSubdomain,
      engagementId: state.engagementId ?? null,
      state,
      expiresAt: state.expiresAt,
    },
  });
}

export async function loadEnrolmentResume(
  resumeKey: string,
): Promise<EnrolmentResumeState | null> {
  const raw = sessionStorage.getItem(storageKey(resumeKey));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as EnrolmentResumeState;
      if (new Date(parsed.expiresAt).getTime() >= Date.now()) {
        return parsed;
      }
    } catch {
      // ignore parse failures and fallback to server
    }
  }

  const { data, error } = await supabase.functions.invoke('load-enrolment-resume', {
    body: { resumeKey },
  });
  if (error || !data?.state) return null;
  const state = data.state as EnrolmentResumeState;
  if (new Date(state.expiresAt).getTime() < Date.now()) return null;

  sessionStorage.setItem(storageKey(resumeKey), JSON.stringify(state));
  return state;
}

export async function clearEnrolmentResume(resumeKey: string): Promise<void> {
  sessionStorage.removeItem(storageKey(resumeKey));
  await supabase.functions.invoke('clear-enrolment-resume', {
    body: { resumeKey },
  });
}

