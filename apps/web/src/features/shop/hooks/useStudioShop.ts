import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { StudioShopService, type ShopProductInput } from '../services/studioShopService';
import { ShopOrdersService } from '../services/shopOrdersService';

/** The studio shop is a beta: only studios the owner switched it on for. */
export function useStudioShopEnabled(): boolean {
  const { hasFeature } = useFeatureGate();
  return hasFeature(FEATURES.billing.studioShop);
}

const productsKey = ['studio-shop-products'] as const;

export function useStudioShopProducts() {
  const queryClient = useQueryClient();
  const products = useQuery({ queryKey: productsKey, queryFn: () => StudioShopService.listProducts() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: productsKey });
  const save = useMutation({
    mutationFn: (input: ShopProductInput) => StudioShopService.saveProduct(input),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => StudioShopService.deleteProduct(id),
    onSuccess: refresh,
  });
  return { products, save, remove };
}

const studioOrdersKey = ['studio-shop-orders'] as const;

export function useStudioShopOrders() {
  const queryClient = useQueryClient();
  const orders = useQuery({ queryKey: studioOrdersKey, queryFn: () => ShopOrdersService.studioOrders() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: studioOrdersKey });
  const setStatus = useMutation({
    mutationFn: (v: { orderId: string; status: 'ready' | 'collected' }) => ShopOrdersService.setStatus(v.orderId, v.status),
    onSuccess: refresh,
  });
  const cancel = useMutation({
    mutationFn: (orderId: string) => ShopOrdersService.cancelOrder(orderId),
    onSuccess: async () => {
      await refresh();
      // A cancelled order gives its stock back.
      await queryClient.invalidateQueries({ queryKey: productsKey });
    },
  });
  return { orders, setStatus, cancel };
}
