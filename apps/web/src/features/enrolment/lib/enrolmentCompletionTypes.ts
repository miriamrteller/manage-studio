import type { ConsentTemplate } from '@shared/schemas';

export type TokenCompletionData = {
  engagementId: string;
  personId: string;
  offeringId: string;
  status: string;
  alreadyComplete: boolean;
  studentName: string;
  className: string;
  waiverRequired: boolean;
  waiverAlreadySigned: boolean;
  waiverEvidenceId: string | null;
  template: ConsentTemplate | null;
  isMinorStudent: boolean;
  amountMinor: number;
  currency: string;
};
