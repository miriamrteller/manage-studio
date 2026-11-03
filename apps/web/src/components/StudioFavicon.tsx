import { useEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { applyFavicon, studioFaviconUrl, studioTabTitle } from '@/lib/studioFavicon';

/**
 * The browser tab on a studio host shows the studio's logo and name;
 * elsewhere (app.opalswift.com, no logo) OpalSwift's icon and name.
 */
export function StudioFavicon() {
  const tenant = useTenant();
  const url = studioFaviconUrl(tenant);
  const title = studioTabTitle(tenant);
  useEffect(() => {
    applyFavicon(url);
  }, [url]);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
