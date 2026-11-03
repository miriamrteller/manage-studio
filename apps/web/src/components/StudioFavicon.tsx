import { useEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { applyFavicon, studioFaviconUrl } from '@/lib/studioFavicon';

/** Studio hosts show the studio's logo in the browser tab; elsewhere OpalSwift's icon. */
export function StudioFavicon() {
  const tenant = useTenant();
  const url = studioFaviconUrl(tenant);
  useEffect(() => {
    applyFavicon(url);
  }, [url]);
  return null;
}
