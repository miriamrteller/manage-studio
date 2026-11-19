import { useQueries } from '@tanstack/react-query';
import { usePhotoShopEnabled } from './usePhotoShop';
import { ClientPhotoShopService } from '../services/clientPhotoShopService';

/**
 * Whether any of these shoots has a shop the client can open: the photo shop feature
 * is on and the gallery service returns a gallery (it passed Check gallery).
 * Same query key and fetch as ClientPhotoShop, so the shop tab reuses this cache.
 */
export function useClientPhotoShopOpen(engagementIds: string[]): { open: boolean; loading: boolean } {
  const enabled = usePhotoShopEnabled();
  const results = useQueries({
    queries: engagementIds.map((id) => ({
      queryKey: ['client-photo-shop', id] as const,
      queryFn: () => ClientPhotoShopService.gallery(id),
      enabled,
    })),
  });
  if (!enabled) return { open: false, loading: false };
  return {
    open: results.some((r) => Boolean(r.data)),
    loading: results.some((r) => r.isPending),
  };
}
