import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Banknote, Check, CreditCard, Eye, FileText, Landmark, Smartphone, type LucideIcon } from 'lucide-react';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { usePhotoShopEnabled, useStudioPhotoShopDefaults } from '@/features/jobs/hooks/usePhotoShop';
import { PAY_TEXT_MAX, bitPhoneInput } from '@/features/jobs/services/photoShopService';
import { PROOF_METHODS, type PayDirectWay } from '@/features/jobs/services/clientPhotoShopService';
import { payWaysLabel } from '@/features/jobs/lib/payDirectLabel';

/**
 * Settings › Online payments › Photo shop (owner, 22 Nov 2026): how clients pay for their
 * photos. One card per way (card, Bit, bank transfer, cash, cheque) with an on/off switch;
 * its details show only while it is on; "What your client sees" follows the switches.
 * Only for studios with the photo shop switched on. Saves only these fields.
 */
export function PhotoShopPayWaysSetting() {
  const enabled = usePhotoShopEnabled();
  if (!enabled) return null;
  return <PayWaysForm />;
}

function PayWaysForm() {
  const { t } = useTranslation();
  const id = useId();
  const { defaults, save } = useStudioPhotoShopDefaults();
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
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (defaults.data && !loaded) {
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

  const shownBitPhone = bitPhone || (bit ? businessPhone : '');
  const touch = <T,>(setter: (v: T) => void) => (v: T) => { setSaved(false); setDirty(true); setter(v); };
  // What clients will see: the same rule as the server (Bit needs its phone, bank its details).
  const previewWays: PayDirectWay[] = [
    ...(bit && shownBitPhone.trim() ? [{ method: 'bit' as const, details: shownBitPhone.trim() }] : []),
    ...(bankOn && bank.trim() ? [{ method: 'bank' as const, details: bank.trim() }] : []),
    ...(cashOn ? [{ method: 'cash' as const, details: cash.trim() || null }] : []),
    ...(chequeOn ? [{ method: 'cheque' as const, details: cheque.trim() || null }] : []),
  ];

  return (
    <section className="max-w-2xl space-y-4" aria-labelledby={`${id}-title`}>
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold text-foreground">{t('settings.photo_shop.pay_direct_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('settings.photo_shop.pay_direct_intro')}</p>
      </div>
      <div className="space-y-3">
        <PayWay id={`${id}-card`} icon={CreditCard} label={t('settings.photo_shop.way_card')}
          hint={t('settings.photo_shop.card_payments_hint')} on={card} onToggle={touch(setCard)} />
        <PayWay id={`${id}-bit`} icon={Smartphone} label={t('settings.photo_shop.accepts_bit')}
          hint={t('settings.photo_shop.bit_hint')} on={bit} onToggle={touch(setBit)}>
          <label htmlFor={`${id}-bit-phone`} className="block text-sm font-medium">{t('settings.photo_shop.bit_phone')}</label>
          <Input id={`${id}-bit-phone`} type="tel" dir="ltr" autoComplete="tel" inputMode="tel" className="max-w-xs"
            placeholder={t('settings.photo_shop.bit_phone_placeholder')} aria-describedby={`${id}-bit-note`}
            value={shownBitPhone} onChange={(e) => touch(setBitPhone)(bitPhoneInput(e.target.value))} />
          <p id={`${id}-bit-note`} className="text-xs text-muted-foreground">
            {!shownBitPhone.trim()
              ? t('settings.photo_shop.bit_phone_missing')
              : !bitPhone && businessPhone
                ? t('settings.photo_shop.bit_phone_prefilled')
                : ''}
          </p>
        </PayWay>
        <PayWay id={`${id}-bank`} icon={Landmark} label={t('settings.photo_shop.accepts_bank')}
          hint={t('settings.photo_shop.bank_hint')} on={bankOn} onToggle={touch(setBankOn)}>
          <label htmlFor={`${id}-bank-details`} className="block text-sm font-medium">{t('settings.photo_shop.bank_details')}</label>
          <Textarea id={`${id}-bank-details`} rows={4} maxLength={PAY_TEXT_MAX}
            placeholder={t('settings.photo_shop.bank_details_placeholder')} aria-describedby={`${id}-bank-note`}
            value={bank} onChange={(e) => touch(setBank)(e.target.value)} />
          <p id={`${id}-bank-note`} className="text-xs text-muted-foreground">
            {bank.trim() ? '' : t('settings.photo_shop.bank_details_missing')}
          </p>
        </PayWay>
        <PayWay id={`${id}-cash`} icon={Banknote} label={t('settings.photo_shop.accepts_cash')}
          hint={t('settings.photo_shop.cash_hint')} on={cashOn} onToggle={touch(setCashOn)}>
          <label htmlFor={`${id}-cash-text`} className="block text-sm font-medium">{t('settings.photo_shop.cash_instructions')}</label>
          <Input id={`${id}-cash-text`} maxLength={PAY_TEXT_MAX} placeholder={t('settings.photo_shop.cash_placeholder')}
            value={cash} onChange={(e) => touch(setCash)(e.target.value)} />
        </PayWay>
        <PayWay id={`${id}-cheque`} icon={FileText} label={t('settings.photo_shop.accepts_cheque')}
          hint={t('settings.photo_shop.cheque_hint')} on={chequeOn} onToggle={touch(setChequeOn)}>
          <label htmlFor={`${id}-cheque-text`} className="block text-sm font-medium">{t('settings.photo_shop.cheque_instructions')}</label>
          <Input id={`${id}-cheque-text`} maxLength={PAY_TEXT_MAX} placeholder={t('settings.photo_shop.cheque_placeholder')}
            value={cheque} onChange={(e) => touch(setCheque)(e.target.value)} />
        </PayWay>
      </div>
      <ClientPreview
        card={card}
        ways={previewWays}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          isLoading={save.isPending}
          disabled={defaults.isLoading}
          onClick={() =>
            save.mutate(
              {
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
              { onSuccess: () => { setSaved(true); setDirty(false); } },
            )
          }
        >
          {t('common.save')}
        </Button>
        <span aria-live="polite" className="text-sm">
          {saved ? (
            <span className="inline-flex items-center gap-1 font-medium text-green-800">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t('settings.photo_shop.pay_saved')}
            </span>
          ) : dirty ? (
            <span className="text-muted-foreground">{t('settings.photo_shop.unsaved')}</span>
          ) : ''}
        </span>
      </div>
      {save.error && <p role="alert" className="text-sm text-error">{(save.error as Error).message}</p>}
    </section>
  );
}

/** One way to pay: a card with its icon, name, what it means, an on/off switch, and its details while on. */
function PayWay({
  id,
  icon: Icon,
  label,
  hint,
  on,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-lg border p-4 transition-colors ${on ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${on ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="block cursor-pointer text-base font-semibold text-foreground">{label}</label>
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className={`text-sm font-medium ${on ? 'text-foreground' : 'text-muted-foreground'}`}>
            {on ? t('settings.photo_shop.on') : t('settings.photo_shop.off')}
          </span>
          <Switch id={id} checked={on} onCheckedChange={onToggle} aria-describedby={`${id}-hint`} />
        </div>
      </div>
      {on && children && <div className="mt-3 space-y-1 sm:ps-[3.25rem]">{children}</div>}
    </div>
  );
}

/** "What your client sees": the ways that are on, worded as on the client's payment page. */
function ClientPreview({ card, ways }: { card: boolean; ways: PayDirectWay[] }) {
  const { t } = useTranslation();
  const headingId = useId();
  const P = 'pages.client_portal.photo_shop';
  const proof = ways.some((w) => PROOF_METHODS.includes(w.method));
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      <h3 id={headingId} className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Eye className="h-4 w-4" aria-hidden="true" />
        {t('settings.photo_shop.preview_title')}
      </h3>
      <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-800">
        <p className="font-medium">{t(`${P}.payment_choose`)}</p>
        {!card && ways.length === 0 ? (
          <p>{t(`${P}.pay_cash`)}</p>
        ) : (
          <ul className="space-y-2">
            {card && <li className="font-medium">{t(`${P}.pay_card`)}</li>}
            {ways.map((w) => (
              <li key={w.method}>
                <p className="font-medium">{payWaysLabel(t, [w.method])}</p>
                {w.method === 'bit' && w.details && <p dir="auto">{t(`${P}.bit_to`, { phone: w.details })}</p>}
                {w.method !== 'bit' && w.details && <p className="whitespace-pre-line" dir="auto">{w.details}</p>}
              </li>
            ))}
          </ul>
        )}
        {proof && <p className="text-xs text-gray-600">{t('settings.photo_shop.preview_proof')}</p>}
      </div>
    </section>
  );
}
