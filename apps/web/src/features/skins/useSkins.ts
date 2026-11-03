import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isBuiltInSkin, type Skin } from '@shared/index';
import { fetchAllSkins, fetchLiveSkins, fetchSkin, fetchSkinUsage, saveSkin } from './skinsService';

export function useAllSkins() {
  return useQuery({ queryKey: ['skins', 'all'], queryFn: fetchAllSkins, staleTime: 60 * 1000 });
}

export function useSkinUsage() {
  return useQuery({ queryKey: ['skins', 'usage'], queryFn: fetchSkinUsage, staleTime: 60 * 1000 });
}

/** Live skins for the wizard. Fails quietly: the wizard then shows the built-in list. */
export function useLiveSkins() {
  return useQuery({ queryKey: ['skins', 'live'], queryFn: fetchLiveSkins, staleTime: 10 * 60 * 1000, retry: 1 });
}

/**
 * A studio's skin row, only for data skins: built-in skins keep their code wording,
 * so a studio on one (Creative Ballet included) makes no extra request.
 */
export function useStudioSkin(skinId: string | null | undefined) {
  const enabled = Boolean(skinId) && !isBuiltInSkin(skinId);
  return useQuery({
    queryKey: ['skins', 'one', skinId],
    queryFn: () => fetchSkin(skinId!),
    enabled,
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveSkin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skin, isNew }: { skin: Skin; isNew: boolean }) => saveSkin(skin, isNew),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['skins'] }),
  });
}
