import { z } from 'zod';
import { BLAST_SCOPES } from './notificationBlastConstants';

export const notificationBlastSchema = z
  .object({
    scope: z.enum(BLAST_SCOPES),
    categoryId: z.preprocess(
      (val) => (val === '' || val == null ? undefined : val),
      z.string().uuid().optional(),
    ),
    offeringId: z.preprocess(
      (val) => (val === '' || val == null ? undefined : val),
      z.string().uuid().optional(),
    ),
    subject: z.string().trim().min(1, 'Subject is required').max(200),
    body: z.string().trim().min(10, 'Body must be at least 10 characters').max(5000),
  })
  .superRefine((data, ctx) => {
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
  });

export type NotificationBlastFormValues = z.infer<typeof notificationBlastSchema>;

export interface BlastRecipientPreview {
  recipient_email: string;
  recipient_name: string | null;
  person_id: string;
  account_member_id: string | null;
}
