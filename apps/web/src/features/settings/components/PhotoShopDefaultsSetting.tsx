import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTenant } from '@/hooks/useTenant';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { usePhotoShopEnabled, useStudioPhotoShopDefaults } from '@/features/jobs/hooks/usePhotoShop';
import {
  PAY_TEXT_MAX,
  bitPhoneInput,
  DEFAULT_GALLERY_OPEN_DAYS,
  majorToMinor,
  minorToMajor,
} from '@/features/jobs/services/photoShopService';

/**
 * Settings → Payment: photo shop defaults, copied into each new shoot's shop
 * (and editable there). Only for studios with the photo shop switched on.
 */
export function PhotoShopDefaultsSetting() {
  const enabled = usePhotoShopEnabled();
  if (!enabled) return null;
  return <PhotoShopDefaultsForm />;
}

function PhotoShopDefaultsForm() {
  const { t } = useTranslation();
  const tenant = useTenant();
  const id = useId();
  const { defaults, save } = useStudioPhotoShopDefaults();
  const [perPhoto, setPerPhoto] = useState('');
  const [allPhotos, setAllPhotos] = useState('');
  const [days, setDays] = useState(String(DEFAULT_GALLERY_OPEN_DAYS));
  const [card, setCard] = useState(false);
  const [bit, setBit] = useState(false);
  const [bitPhone, setBitPhone] = useState('');
  const [bankOn, setBankOn] = useState(false);
  const [bank, setBank] = useState('');
  const [cashOn, setCashOn] = useState(false);
  const [cash, setCash] = useState('');
  const [chequeOn, setChequeOn] = useState(false);
  const [cheque, setCheque] = useState('');
  // Prefill: an empty Bit number starts from the business phone (Settings › Legal documents).
  const { data: legal } = useTenantLegalProfile();
  const businessPhone = bitPhoneInput((legal?.profile?.phone ?? '').trim()).trim();
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (defaults.data && !loaded) {
      setPerPhoto(minorToMajor(defaults.data.price_per_photo_minor));
      setAllPhotos(minorToMajor(defaults.data.all_photos_price_minor));
      setDays(String(defaults.data.gallery_open_days));
      setCard(defaults.data.card_payments === true);
      setBit(defaults.data.accepts_bit === true);
      setBitPhone(defaults.data.bit_phone ?? '');
      setBankOn(defaults.data.accepts_bank === true);
      setBank(defaults.data.bank_details ?? '');
      setCashOn(defaults.data.accepts_cash === true);
      setCash(defaults.data.cash_instructions ?? '');
      setChequeOn(defaults.data.accepts_cheque === true);
      setCheque(defaults.data.cheque_instructions ?? '');
      setLoaded(true);
    }
  }, [defaults.data, loaded]);

  const currency = tenant?.currency || 'ILS';
  const shownBitPhone = bitPhone || (bit ? businessPhone : '');
  const daysNumber = Math.min(3650, Math.max(1, Math.floor(Number(days) || DEFAULT_GALLERY_OPEN_DAYS)));
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setSaved(false); setter(v); };

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">
        {t('settings.photo_shop.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('settings.photo_shop.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-per`} className="block text-sm font-medium">
            {t('settings.photo_shop.per_photo', { currency })}
          </label>
          <Input id={`${id}-per`} type="number" min={0} step="0.01" inputMode="decimal" value={perPhoto}
            onChange={(e) => touch(setPerPhoto)(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-all`} className="block text-sm font-medium">
            {t('settings.photo_shop.all_photos', { currency })}
          </label>
          <Input id={`${id}-all`} type="number" min={0} step="0.01" inputMode="decimal" value={allPhotos}
            aria-describedby={`${id}-all-hint`} onChange={(e) => touch(setAllPhotos)(e.target.value)} />
          <p id={`${id}-all-hint`} className="text-xs text-muted-foreground">{t('settings.photo_shop.all_photos_hint')}</p>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-days`} className="block text-sm font-medium">
            {t('settings.photo_shop.open_days')}
          </label>
          <Input id={`${id}-days`} type="number" min={1} max={3650} inputMode="numeric" value={days}
            onChange={(e) => touch(setDays)(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={card} aria-describedby={`${id}-card-hint`}
            onChange={(e) => touch(setCard)(e.target.checked)} />
          {t('settings.photo_shop.card_payments')}
        </label>
        <p id={`${id}-card-hint`} className="text-xs text-muted-foreground">{t('settings.photo_shop.card_payments_hint')}</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('settings.photo_shop.pay_direct_title')}</legend>
        <p className="text-xs text-muted-foreground">{t('settings.photo_shop.pay_direct_intro')}</p>
        <PayWay id={`${id}-bit`} label={t('settings.photo_shop.accepts_bit')} on={bit} onToggle={touch(setBit)}>
          <label htmlFor={`${id}-bit-phone`} className="block text-sm font-medium">{t('settings.photo_shop.bit_phone')}</label>
          <Input id={`${id}-bit-phone`} type="tel" dir="ltr" autoComplete="tel" inputMode="tel" className="max-w-xs"
            value={shownBitPhone} onChange={(e) => touch(setBitPhone)(bitPhoneInput(e.target.value))} />
        </PayWay>
        <PayWay id={`${id}-bank`} label={t('settings.photo_shop.accepts_bank')} on={bankOn} onToggle={touch(setBankOn)}>
          <label htmlFor={`${id}-bank-details`} className="block text-sm font-medium">{t('settings.photo_shop.bank_details')}</label>
          <textarea id={`${id}-bank-details`} className="form-input w-full" rows={4} maxLength={PAY_TEXT_MAX}
            aria-describedby={`${id}-bank-hint`} value={bank} onChange={(e) => touch(setBank)(e.target.value)} />
          <p id={`${id}-bank-hint`} className="text-xs text-muted-foreground">{t('settings.photo_shop.bank_details_hint')}</p>
        </PayWay>
        <PayWay id={`${id}-cash`} label={t('settings.photo_shop.accepts_cash')} on={cashOn} onToggle={touch(setCashOn)}>
          <label htmlFor={`${id}-cash-text`} className="block text-sm font-medium">{t('settings.photo_shop.cash_instructions')}</label>
          <Input id={`${id}-cash-text`} maxLength={PAY_TEXT_MAX} placeholder={t('settings.photo_shop.cash_placeholder')}
            value={cash} onChange={(e) => touch(setCash)(e.target.value)} />
        </PayWay>
        <PayWay id={`${id}-cheque`} label={t('settings.photo_shop.accepts_cheque')} on={chequeOn} onToggle={touch(setChequeOn)}>
          <label htmlFor={`${id}-cheque-text`} className="block text-sm font-medium">{t('settings.photo_shop.cheque_instructions')}</label>
          <Input id={`${id}-cheque-text`} maxLength={PAY_TEXT_MAX} placeholder={t('settings.photo_shop.cheque_placeholder')}
            value={cheque} onChange={(e) => touch(setCheque)(e.target.value)} />
        </PayWay>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          isLoading={save.isPending}
          disabled={defaults.isLoading}
          onClick={() =>
            save.mutate(
              {
                price_per_photo_minor: majorToMinor(perPhoto),
                all_photos_price_minor: majorToMinor(allPhotos),
                gallery_open_days: daysNumber,
                card_payments: card,
                accepts_bit: bit,
                bit_phone: shownBitPhone.trim() || null,
                accepts_bank: bankOn,
                bank_details: bank.trim().slice(0, PAY_TEXT_MAX) || null,
                accepts_cash: cashOn,
                cash_instructions: cash.trim().slice(0, PAY_TEXT_MAX) || null,
                accepts_cheque: chequeOn,
                cheque_instructions: cheque.trim().slice(0, PAY_TEXT_MAX) || null,
              },
              { onSuccess: () => setSaved(true) },
            )
          }
        >
          {t('common.save')}
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {saved ? t('settings.photo_shop.saved') : ''}
        </span>
      </div>
      {save.error && <p role="alert" className="text-sm text-error">{(save.error as Error).message}</p>}
    </section>
  );
}

/** One way to pay (Bit, bank transfer, cash, cheque): its switch, and its details while on. */
function PayWay({
  id,
  label,
  on,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <input id={id} type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} />
        {label}
      </label>
      {on && <div className="space-y-1 ps-6">{children}</div>}
    </div>
  );
}
