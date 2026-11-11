import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FEATURES } from '@shared/index';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { StudioShopService, type ShopProductInput } from '../services/studioShopService';

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
