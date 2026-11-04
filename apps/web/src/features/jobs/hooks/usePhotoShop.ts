import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTenant } from '@/hooks/useTenant';
import {
  PhotoShopService,
  type JobPhotoShopPatch,
  type StudioPhotoShopDefaults,
} from '../services/photoShopService';

/** The photo shop is a beta: only studios the owner switched it on for. */
export function usePhotoShopEnabled(): boolean {
  const { hasFeature } = useFeatureGate();
  return hasFeature(FEATURES.billing.photoShop);
}

const shopKey = (id: string) => ['photo-shop', id] as const;
const ordersKey = (id: string) => ['photo-shop-orders', id] as const;
const defaultsKey = (tenantId: string | undefined) => ['photo-shop-defaults', tenantId] as const;

export function useJobPhotoShop(engagementId: string, enabled = true) {
  const queryClient = useQueryClient();
  const shop = useQuery({
    queryKey: shopKey(engagementId),
    queryFn: () => PhotoShopService.getShop(engagementId),
    enabled,
  });
  const orders = useQuery({
    queryKey: ordersKey(engagementId),
    queryFn: () => PhotoShopService.listOrders(engagementId),
    enabled,
  });
  const save = useMutation({
    mutationFn: (patch: JobPhotoShopPatch) => PhotoShopService.saveShop(engagementId, patch),
    onSuccess: (data) => queryClient.setQueryData(shopKey(engagementId), data),
  });
  const deliver = useMutation({
    mutationFn: (params: { orderId: string; url: string }) => PhotoShopService.deliver(params.orderId, params.url),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ordersKey(engagementId) }),
  });
  return { shop, orders, save, deliver };
}

export function useStudioPhotoShopDefaults() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const defaults = useQuery({
    queryKey: defaultsKey(tenant?.id),
    queryFn: () => PhotoShopService.getDefaults(tenant!.id),
    enabled: Boolean(tenant?.id),
  });
  const save = useMutation({
    mutationFn: (values: StudioPhotoShopDefaults) => PhotoShopService.saveDefaults(tenant!.id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: defaultsKey(tenant?.id) }),
  });
  return { defaults, save };
}
