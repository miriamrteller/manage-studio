import { z } from 'zod';
import { BLAST_SCOPES } from './notificationBlastConstants';

const blastScopeFields = {
  scope: z.enum(BLAST_SCOPES),
  categoryId: z.preprocess(
    (val) => (val === '' || val == null ? undefined : val),
    z.string().uuid().optional(),
  ),
  offeringId: z.preprocess(
    (val) => (val === '' || val == null ? undefined : val),
    z.string().uuid().optional(),
  ),
  accountId: z.preprocess(
    (val) => (val === '' || val == null ? undefined : val),
    z.string().uuid().optional(),
  ),
};

function refineBlastScope(
  data: {
    scope: (typeof BLAST_SCOPES)[number];
    categoryId?: string;
    offeringId?: string;
    accountId?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.scope === 'level' && !data.categoryId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Level is required',
      path: ['categoryId'],
    });
  }
  if (data.scope === 'class' && !data.offeringId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Class is required',
      path: ['offeringId'],
    });
  }
  if (data.scope === 'account' && !data.accountId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Account is required',
      path: ['accountId'],
    });
  }
}

/** Validates recipient scope only — used before loading the recipient list. */
export const notificationBlastPreviewSchema = z
  .object(blastScopeFields)
  .superRefine(refineBlastScope);

export const notificationBlastSchema = z
  .object({
    ...blastScopeFields,
    subject: z.string().trim().min(1, 'Subject is required').max(200),
    body: z.string().trim().min(10, 'Body must be at least 10 characters').max(5000),
  })
  .superRefine(refineBlastScope);

export type NotificationBlastFormValues = z.infer<typeof notificationBlastSchema>;

export interface BlastRecipientPreview {
  recipient_email: string;
  recipient_name: string | null;
  person_id: string;
  account_member_id: string | null;
  account_name: string | null;
  class_names: string | null;
}

export interface BlastAccountSearchResult {
  account_id: string;
  account_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
}
