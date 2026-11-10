import type { ConsentTemplate } from '@shared/schemas';
import type { ClassDiscountLine } from './checkoutBootstrapTypes';

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
  listAmountMinor?: number | null;
  discounts?: ClassDiscountLine[];
  currency: string;
};
