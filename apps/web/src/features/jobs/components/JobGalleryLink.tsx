import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useJobGallery } from '../hooks/useJobPaymentRequests';
import { safeGalleryUrl } from '../lib/galleryUrl';

/** Admin: is the gallery visible to the client yet (released by hand or everything paid)? */
export function JobGalleryReleaseBadge({ engagementId }: { engagementId: string }) {
  const { t } = useTranslation();
  const { gallery, isLoading } = useJobGallery(engagementId);
  if (isLoading || !gallery) return null;
  return (
    <Badge variant={gallery.released ? 'success' : 'secondary'}>
      {gallery.released ? t('pages.jobs.gallery_visible_to_client') : t('pages.jobs.gallery_hidden_from_client')}
    </Badge>
  );
}

/** Small "Gallery" link for a Shoots list row; nothing when there is no valid link. */
export function JobGalleryRowLink({ url, clientName }: { url: string | null; clientName: string | null }) {
  const { t } = useTranslation();
  const href = safeGalleryUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium underline"
      aria-label={t('pages.jobs.open_gallery_for', { name: clientName ?? '—' })}
    >
      {t('pages.jobs.gallery')}
    </a>
  );
}
