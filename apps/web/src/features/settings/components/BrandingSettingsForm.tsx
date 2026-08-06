import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';
import { FONT_PAIRS, FontPairId } from '@/hooks/useFontLoader';

interface BrandingFormData {
  primary_color: string;
  accent_color: string;
  font_pair: FontPairId;
}

export function BrandingSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);

  const [formData, setFormData] = useState<BrandingFormData>({
    primary_color: '#6366f1',
    accent_color: '#ec4899',
    font_pair: 'reliable',
  });

  const [isUploadingLight, setIsUploadingLight] = useState(false);
  const [isUploadingDark, setIsUploadingDark] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tenant) {
      setFormData({
        primary_color: tenant.white_label?.primary_color ?? '#6366f1',
        accent_color: tenant.white_label?.accent_color ?? '#ec4899',
        font_pair: (tenant.font_pair as FontPairId) ?? 'reliable',
      });
    }
  }, [tenant]);

  useEffect(() => {
    const pair = FONT_PAIRS[formData.font_pair];
    if (!pair) return;

    if (fontLinkRef.current) {
      fontLinkRef.current.remove();
    }

    const families = [pair.en, pair.he]
      .map((f) => f.replace(/\s+/g, '+'))
      .join('&family=');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    document.head.appendChild(link);
    fontLinkRef.current = link;

    return () => {
      if (fontLinkRef.current) {
        fontLinkRef.current.remove();
        fontLinkRef.current = null;
      }
    };
  }, [formData.font_pair]);

  const saveBrandingMutation = useMutation({
    mutationFn: async (data: BrandingFormData) => {
      if (!tenant) throw new Error('No tenant');
      const { error } = await supabase
        .from('tenants')
        .update({
          primary_color: data.primary_color,
          accent_color: data.accent_color,
          font_pair: data.font_pair,
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
  });

  const handleColorChange = (field: 'primary_color' | 'accent_color', value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFontPairChange = (value: FontPairId) => {
    setFormData((prev) => ({ ...prev, font_pair: value }));
  };

  const handleSaveBranding = () => {
    saveBrandingMutation.mutate(formData);
  };

  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'png';
  };

  const uploadLogo = async (
    file: File,
    variant: 'light' | 'dark'
  ): Promise<string> => {
    if (!tenant) throw new Error('No tenant');

    const extension = getFileExtension(file.name);
    const filename = variant === 'light' ? `logo.${extension}` : `logo-dark.${extension}`;
    const path = `${tenant.id}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('tenant-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('tenant-assets').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
    variant: 'light' | 'dark'
  ) => {
    const file = event.target.files?.[0];
    if (!file || !tenant) return;

    setUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(t('settings.branding.fileTooLarge', 'File too large (max 2MB)'));
      return;
    }

    const setUploading = variant === 'light' ? setIsUploadingLight : setIsUploadingDark;
    setUploading(true);

    try {
      const publicUrl = await uploadLogo(file, variant);
      const updateField = variant === 'light' ? 'logo_url' : 'logo_dark_url';

      const { error } = await supabase
        .from('tenants')
        .update({ [updateField]: publicUrl })
        .eq('id', tenant.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['tenant'] });
    } catch (err) {
      setUploadError(
        t('settings.branding.uploadFailed', 'Upload failed. Please try again.')
      );
      console.error('Logo upload error:', err);
    } finally {
      setUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleRemoveLogo = async (variant: 'light' | 'dark') => {
    if (!tenant) return;

    const updateField = variant === 'light' ? 'logo_url' : 'logo_dark_url';
    const setUploading = variant === 'light' ? setIsUploadingLight : setIsUploadingDark;

    setUploading(true);

    try {
      const { error } = await supabase
        .from('tenants')
        .update({ [updateField]: null })
        .eq('id', tenant.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['tenant'] });
    } catch (err) {
      console.error('Remove logo error:', err);
    } finally {
      setUploading(false);
    }
  };

  const selectedPair = FONT_PAIRS[formData.font_pair];

  if (!tenant) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Colors */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          {t('settings.branding.colors', 'Colors')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label
              htmlFor="primary-color"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              {t('settings.branding.primaryColor', 'Primary Color')}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="primary-color"
                value={formData.primary_color}
                onChange={(e) => handleColorChange('primary_color', e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-[var(--border-default)] bg-[var(--surface-raised)]"
              />
              <input
                type="text"
                value={formData.primary_color}
                onChange={(e) => handleColorChange('primary_color', e.target.value)}
                className="flex-1 h-10 px-3 rounded border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--state-focus)]"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="accent-color"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              {t('settings.branding.accentColor', 'Accent Color')}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="accent-color"
                value={formData.accent_color}
                onChange={(e) => handleColorChange('accent_color', e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-[var(--border-default)] bg-[var(--surface-raised)]"
              />
              <input
                type="text"
                value={formData.accent_color}
                onChange={(e) => handleColorChange('accent_color', e.target.value)}
                className="flex-1 h-10 px-3 rounded border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--state-focus)]"
                pattern="^#[0-9A-Fa-f]{6}$"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Font Pair */}
      <section>
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          {t('settings.branding.fontPair', 'Font Pair')}
        </h2>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="font-pair-select"
              className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2"
            >
              {t('settings.branding.selectFontPair', 'Select Font Pair')}
            </label>
            <select
              id="font-pair-select"
              value={formData.font_pair}
              onChange={(e) => handleFontPairChange(e.target.value as FontPairId)}
              className="w-full h-10 px-3 rounded border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--state-focus)]"
            >
              {(Object.entries(FONT_PAIRS) as [FontPairId, typeof FONT_PAIRS[FontPairId]][]).map(
                ([id, pair]) => (
                  <option key={id} value={id}>
                    {pair.name} — {pair.en} / {pair.he}
                  </option>
                )
              )}
            </select>
          </div>

          <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              {t('settings.branding.fontPreview', 'Font Preview')}
            </p>
            <div className="space-y-2">
              <p
                className="text-lg text-[var(--color-text-primary)]"
                style={{ fontFamily: `"${selectedPair.en}", sans-serif` }}
              >
                The quick brown fox jumps over the lazy dog
              </p>
              <p
                className="text-lg text-[var(--color-text-primary)]"
                dir="rtl"
                style={{ fontFamily: `"${selectedPair.he}", sans-serif` }}
              >
                שועל חום מהיר קופץ מעל הכלב העצלן
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Save Button for Colors + Font */}
      <div className="pt-4 border-t border-[var(--border-subtle)]">
        <Button
          onClick={handleSaveBranding}
          disabled={saveBrandingMutation.isPending}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-6"
        >
          {saveBrandingMutation.isPending
            ? t('common.saving', 'Saving...')
            : t('common.saveChanges', 'Save Changes')}
        </Button>
        {saveBrandingMutation.isSuccess && (
          <span className="ms-3 text-sm text-[var(--color-success)]">
            {t('common.saved', 'Saved!')}
          </span>
        )}
        {saveBrandingMutation.isError && (
          <span className="ms-3 text-sm text-[var(--color-error)]">
            {t('common.saveFailed', 'Save failed. Please try again.')}
          </span>
        )}
      </div>

      {/* Section 3: Logo Upload */}
      <section className="pt-6 border-t border-[var(--border-subtle)]">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-4">
          {t('settings.branding.logos', 'Logos')}
        </h2>

        {uploadError && (
          <div className="mb-4 p-3 rounded bg-[var(--color-error)]/10 border border-[var(--color-error)] text-[var(--color-error)] text-sm">
            {uploadError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Light Logo */}
          <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
              {t('settings.branding.lightLogo', 'Light Mode Logo')}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mb-4">
              {t(
                'settings.branding.lightLogoDescription',
                'Displayed on light backgrounds. PNG, JPEG, SVG, or WebP (max 2MB).'
              )}
            </p>

            {tenant.logo_url ? (
              <div className="space-y-3">
                <div className="p-3 rounded bg-white border border-[var(--border-subtle)] flex items-center justify-center min-h-[80px]">
                  <img
                    src={tenant.logo_url}
                    alt={tenant.name}
                    className="h-12 max-w-[200px] object-contain rounded"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => lightInputRef.current?.click()}
                    disabled={isUploadingLight}
                    className="flex-1"
                  >
                    {t('settings.branding.replaceLogo', 'Replace')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveLogo('light')}
                    disabled={isUploadingLight}
                    className="text-[var(--color-error)] border-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                  >
                    {t('settings.branding.removeLogo', 'Remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => lightInputRef.current?.click()}
                disabled={isUploadingLight}
                className="w-full"
              >
                {isUploadingLight
                  ? t('settings.branding.uploading', 'Uploading...')
                  : t('settings.branding.uploadLogo', 'Upload Logo')}
              </Button>
            )}

            <input
              ref={lightInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => handleFileSelect(e, 'light')}
              className="sr-only"
              aria-label={t('settings.branding.uploadLightLogo', 'Upload light mode logo')}
            />
          </div>

          {/* Dark Logo */}
          <div className="p-4 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)]">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)] mb-3">
              {t('settings.branding.darkLogo', 'Dark Mode Logo')}
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mb-4">
              {t(
                'settings.branding.darkLogoDescription',
                'Displayed on dark backgrounds. PNG, JPEG, SVG, or WebP (max 2MB).'
              )}
            </p>

            {tenant.logo_dark_url ? (
              <div className="space-y-3">
                <div className="p-3 rounded bg-gray-900 border border-[var(--border-subtle)] flex items-center justify-center min-h-[80px]">
                  <img
                    src={tenant.logo_dark_url}
                    alt={`${tenant.name} (dark)`}
                    className="h-12 max-w-[200px] object-contain rounded"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => darkInputRef.current?.click()}
                    disabled={isUploadingDark}
                    className="flex-1"
                  >
                    {t('settings.branding.replaceLogo', 'Replace')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveLogo('dark')}
                    disabled={isUploadingDark}
                    className="text-[var(--color-error)] border-[var(--color-error)] hover:bg-[var(--color-error)]/10"
                  >
                    {t('settings.branding.removeLogo', 'Remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => darkInputRef.current?.click()}
                disabled={isUploadingDark}
                className="w-full"
              >
                {isUploadingDark
                  ? t('settings.branding.uploading', 'Uploading...')
                  : t('settings.branding.uploadLogo', 'Upload Logo')}
              </Button>
            )}

            <input
              ref={darkInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(e) => handleFileSelect(e, 'dark')}
              className="sr-only"
              aria-label={t('settings.branding.uploadDarkLogo', 'Upload dark mode logo')}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
