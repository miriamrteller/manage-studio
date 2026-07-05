import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import type { NotificationLog } from '@shared/schemas';
import { applyRecipientFilter, resolveRecipientSearchIds } from '@/features/notifications/lib/notificationLogQuery';

interface UseNotificationLogOptions {
  pageSize?: number;
  page?: number;
  channel?: 'email' | 'whatsapp' | 'voice';
  status?: 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';
  sortOrder?: 'asc' | 'desc';
  recipientQuery?: string;
}

interface NotificationLogResponse {
  items: NotificationLog[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * Hook: useNotificationLog
 * Fetches paginated notification log for tenant
 * Supports filtering by channel, status, and recipient name/email/phone
 */
export function useNotificationLog(options: UseNotificationLogOptions = {}) {
  const tenant = useTenant();
  const pageSize = options.pageSize || 25;
  const page = options.page || 1;
  const sortOrder = options.sortOrder || 'desc';
  const offset = (page - 1) * pageSize;

  const query = useQuery({
    queryKey: [
      'notificationLog',
      tenant?.id,
      page,
      pageSize,
      options.channel,
      options.status,
      options.recipientQuery,
      sortOrder,
    ],
    queryFn: async (): Promise<NotificationLogResponse> => {
      if (!tenant?.id) throw new Error('Tenant not found');

      const recipientSearchIds = await resolveRecipientSearchIds(tenant.id, options.recipientQuery);

      let queryBuilder = supabase
        .from('notification_log')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .order('sent_at', { ascending: sortOrder === 'asc' });

      // Apply filters
      if (options.channel) {
        queryBuilder = queryBuilder.eq('channel', options.channel);
      }
      if (options.status) {
        queryBuilder = queryBuilder.eq('status', options.status);
      }
      queryBuilder = applyRecipientFilter(queryBuilder, options.recipientQuery, recipientSearchIds);

      let countQuery = supabase
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

      if (options.channel) {
        countQuery = countQuery.eq('channel', options.channel);
      }
      if (options.status) {
        countQuery = countQuery.eq('status', options.status);
      }
      countQuery = applyRecipientFilter(countQuery, options.recipientQuery, recipientSearchIds);

      const [dataResult, countResult] = await Promise.all([
        queryBuilder.range(offset, offset + pageSize - 1),
        countQuery,
      ]);

      if (dataResult.error) throw dataResult.error;
      if (countResult.error) throw countResult.error;

      const total = countResult.count || 0;
      const pageCount = Math.ceil(total / pageSize);

      return {
        items: dataResult.data || [],
        total,
        page,
        pageSize,
        pageCount,
      };
    },
    enabled: !!tenant?.id,
  });

  return {
    logs: query.data?.items || [],
    total: query.data?.total || 0,
    page,
    pageSize,
    pageCount: query.data?.pageCount || 0,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: page < (query.data?.pageCount || 0),
  };
}
