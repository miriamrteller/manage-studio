import { supabase } from '@/lib/supabase';
import { analyzeLogo } from '@/lib/theme/logoTone';
import { LOGO_CACHE_SECONDS, TENANT_ASSETS_BUCKET, logoObjectPath } from '@/lib/tenantLogoStorage';

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPT = 'image/png,image/jpeg,image/svg+xml,image/webp';

/**
 * Upload a studio logo and make it the studio's logo (url + measured tone).
 * A new file name per upload, so the new logo shows at once. Used by Settings
 * → Branding and by the setup wizard (right after the studio is created).
 */
export async function uploadTenantLogo(
  tenantId: string,
  file: File,
  variant: 'light' | 'dark' = 'light',
): Promise<string> {
  if (file.size > MAX_LOGO_BYTES) throw new Error('logo_too_large');
  const path = logoObjectPath(tenantId, variant, file.name);
  const { error: uploadError } = await supabase.storage
    .from(TENANT_ASSETS_BUCKET)
    .upload(path, file, { upsert: false, cacheControl: LOGO_CACHE_SECONDS, contentType: file.type || undefined });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from(TENANT_ASSETS_BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;
  // Measured from the local file (no CORS), for the header logo fix.
  const tone = await analyzeLogo(file);
  const { error } = await supabase
    .from('tenants')
    .update(variant === 'light' ? { logo_url: publicUrl, logo_tone: tone } : { logo_dark_url: publicUrl, logo_dark_tone: tone })
    .eq('id', tenantId);
  if (error) throw error;
  return publicUrl;
}
