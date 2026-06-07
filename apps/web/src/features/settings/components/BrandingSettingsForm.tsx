import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useTenant } from '@/hooks/useTenant';
import queryClient from '@/lib/query-client';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function BrandingSettingsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const [primaryColor, setPrimaryColor] = useState('#76335a');
  const [accentColor, setAccentColor] = useState('#e99ac4');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant?.white_label) return;
    setPrimaryColor(tenant.white_label.primary_color || '#76335a');
    setAccentColor(
      tenant.white_label.accent_color ||
        tenant.white_label.secondary_color ||
        '#e99ac4'
    );
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenant?.id) throw new Error('Tenant not loaded');
      if (!HEX_COLOR.test(primaryColor) || !HEX_COLOR.test(accentColor)) {
        throw new Error(t('settings.hub.color_invalid'));
      }
      const { error } = await supabase
        .from('tenants')
        .update({
          primary_color: primaryColor,
          accent_color: accentColor,
        })
        .eq('id', tenant.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setMessage(t('settings.hub.branding_saved'));
      await queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: (err: Error) => {
      setMessage(err.message);
    },
  });

  if (!tenant) return null;

  return (
    <section className="space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-foreground">{t('settings.hub.branding_title')}</h2>
      <p className="text-sm text-muted-foreground">{t('settings.hub.branding_description')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="primary-color">
            {t('settings.hub.primary_color')}
          </label>
          <div className="flex gap-2 items-center">
            <input
              id="primary-color"
              type="color"
              className="h-10 w-14 cursor-pointer rounded border"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              aria-label={t('settings.hub.primary_color')}
            />
            <input
              type="text"
              className="form-input flex-1 font-mono text-sm"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="accent-color">
            {t('settings.hub.accent_color')}
          </label>
          <div className="flex gap-2 items-center">
            <input
              id="accent-color"
              type="color"
              className="h-10 w-14 cursor-pointer rounded border"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              aria-label={t('settings.hub.accent_color')}
            />
            <input
              type="text"
              className="form-input flex-1 font-mono text-sm"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              pattern="^#[0-9A-Fa-f]{6}$"
            />
          </div>
        </div>
      </div>

      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}

      <Button
        variant="primary"
        disabled={saveMutation.isPending}
        onClick={() => void saveMutation.mutate()}
      >
        {t('common.save')}
      </Button>
    </section>
  );
}
