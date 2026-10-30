import { supabase } from '@/lib/supabase';
import { formatQuoteDate, formatQuoteMoney } from '../lib/quoteFormat';
import { quotePublicUrl } from '../lib/quoteLinks';
import type { QuoteDetail } from './quoteService';

/**
 * Email the quote link through the existing send-notification function
 * (template quote_sent, rendered from the Deno shell). Values are formatted in
 * the tenant's email language, which is what send-notification renders in.
 */
export async function sendQuoteEmail(quote: QuoteDetail, tenantId: string, emailLanguage: string): Promise<void> {
  if (!quote.client_email) throw new Error('No client email');
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: {
      tenantId,
      channel: 'email',
      templateName: 'quote_sent',
      recipientEmail: quote.client_email,
      variables: {
        recipientName: quote.client_name ?? '',
        quoteUrl: quotePublicUrl(quote.public_token),
        totalFormatted: formatQuoteMoney(quote.total_minor, quote.currency, emailLanguage),
        validUntil: formatQuoteDate(quote.valid_until, emailLanguage),
        shootDate: formatQuoteDate(quote.shoot_date, emailLanguage),
      },
    },
  });
  if (error) throw new Error(error.message);
  const result = data as { success?: boolean; failureReason?: string } | null;
  if (result && result.success === false) throw new Error(result.failureReason ?? 'Email failed');
}
