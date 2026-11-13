import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Mail, MapPin, Music, Phone, Sparkles, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClasses } from '@/features/classes/hooks';
import { useBookableOfferings } from '@/features/home/useBookableOfferings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEntityLabels } from '@/hooks/useEntityLabels';
import { useTenant } from '@/hooks/useTenant';
import { useTenantLegalProfile } from '@/legal/useLegalDocument';
import { hasParentRole } from '@/lib/parentRoles';
import { currentStudioDisplayName } from '@/lib/studioDisplayName';
import {
  homeButtons,
  homeIntroKey,
  studioHasBooking,
  studioHasClasses,
  type HomeCta,
} from '@/lib/studioSections';
import { formatCurrency } from '@shared/format';
import type { PublicOffering } from '@/schemas';

const VERTICAL_ICON = { dance: Music, generic: Store, photographer: Camera, beautician: Sparkles } as const;
const PREVIEW_COUNT = 3;
const SERVICE_COUNT = 6;

/**
 * The studio's public homepage ("/"). Everything on it comes from what the studio has already set
 * up (name, vertical, classes, bookable services, enquiry form, published contact details), and a
 * section appears only when the studio has it, so a studio with little set up still gets a decent
 * page: name, a line about the business, an enquiry button and a way to get in touch.
 */
export default function HomePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const tenant = useTenant();
  const { user } = useCurrentUser();
  const { classLabels } = useEntityLabels();
  const { data: legal } = useTenantLegalProfile();

  const sectionInput = { vertical: tenant?.vertical, enabledFeatures: tenant?.enabled_features, profile: tenant?.profile };
  const hasClasses = studioHasClasses(sectionInput);
  const hasBooking = studioHasBooking(sectionInput);
  const introKey = homeIntroKey(sectionInput);
  const Icon = VERTICAL_ICON[introKey];
  // Never an empty heading: a studio with no name on record (or one still loading) reads as "our studio".
  const studioName = currentStudioDisplayName(tenant) || t('pages.home.fallback_name');
  const { primary, secondary } = homeButtons(sectionInput);

  const { classes } = useClasses({ enabled: hasClasses });
  const { offerings } = useBookableOfferings(hasBooking);
  const locale = i18n.language?.startsWith('he') ? 'he-IL' : 'en-IL';
  const currency = tenant?.currency ?? 'ILS';

  const roles = user?.role ?? [];
  const isAdmin = roles.includes('tenant_admin');
  const portalPath = hasParentRole(roles)
    ? '/dashboard/portal'
    : roles.some((r) => r === 'student' || r === 'adult_student')
      ? '/dashboard/student'
      : null;

  // "See classes" in the middle of a sentence: lower case in English (Hebrew has no case).
  const itemsWord = classLabels.plural.toLocaleLowerCase(i18n.language?.startsWith('he') ? 'he' : 'en');
  const buttonLabel = (cta: HomeCta) =>
    cta.kind === 'classes'
      ? t('pages.home.cta_classes', { items: itemsWord })
      : t(`pages.home.cta_${cta.kind}`);

  const classPreview = ((classes as PublicOffering[]) ?? []).slice(0, PREVIEW_COUNT);
  const services = offerings.slice(0, SERVICE_COUNT);
  const profile = legal?.profile ?? {};
  const address = legal?.published ? profile.address : undefined;
  const phone = legal?.published ? profile.phone : undefined;
  const email = legal?.contactEmail;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {(isAdmin || portalPath) && (
        <nav aria-label={t('pages.home.your_area')} className="flex flex-wrap items-center gap-3 text-sm">
          {isAdmin && (
            <Link to="/admin" className="font-medium underline">
              {t('pages.home.open_dashboard')}
            </Link>
          )}
          {portalPath && (
            <Link to={portalPath} className="font-medium underline">
              {t(portalPath === '/dashboard/student' ? 'nav.student_dashboard' : 'nav.my_account')}
            </Link>
          )}
        </nav>
      )}

      <section aria-labelledby="home-title" className="rounded-2xl border border-border bg-muted/40 px-6 py-10 sm:px-10 sm:py-14">
        <Icon aria-hidden className="mb-4 h-10 w-10 text-primary" />
        <h1 id="home-title" dir="auto" className="text-3xl font-bold sm:text-4xl">
          {studioName}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground/80">
          {t(`pages.home.intro_${introKey}`, { name: studioName })}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => navigate(primary.path)}>
            {buttonLabel(primary)}
          </Button>
          {secondary && (
            <Button variant="outline" onClick={() => navigate(secondary.path)}>
              {buttonLabel(secondary)}
            </Button>
          )}
        </div>
      </section>

      {hasClasses && classPreview.length > 0 && (
        <HomeSection title={classLabels.plural} id="home-classes">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classPreview.map((c) => (
              <li key={c.id} className="rounded-xl border border-border p-4">
                <h3 dir="auto" className="font-semibold">{c.name}</h3>
                {c.category_name && <p className="mt-1 text-sm text-muted-foreground">{c.category_name}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link to="/classes" className="font-medium underline">
              {t('pages.home.all_classes', { items: itemsWord })}
            </Link>
          </p>
        </HomeSection>
      )}

      {hasBooking && services.length > 0 && (
        <HomeSection title={t('pages.home.book_title')} id="home-services">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <li key={s.id} className="rounded-xl border border-border p-4">
                <h3 dir="auto" className="font-semibold">{s.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[s.duration_mins ? t('pages.home.minutes', { count: s.duration_mins }) : null,
                    s.price_minor > 0 ? formatCurrency(s.price_minor, s.currency || currency, locale) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <Link to={`/book/${s.id}`} className="mt-3 inline-block font-medium underline">
                  {t('pages.home.cta_book')}
                </Link>
              </li>
            ))}
          </ul>
        </HomeSection>
      )}

      <HomeSection title={t('pages.home.contact_title')} id="home-contact">
        <ul className="space-y-2">
          {email && (
            <li className="flex items-center gap-2">
              <Mail aria-hidden className="h-4 w-4 shrink-0" />
              <a href={`mailto:${email}`} dir="ltr" className="underline">{email}</a>
            </li>
          )}
          {phone && (
            <li className="flex items-center gap-2">
              <Phone aria-hidden className="h-4 w-4 shrink-0" />
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} dir="ltr" className="underline">{phone}</a>
            </li>
          )}
          {address && (
            <li className="flex items-center gap-2">
              <MapPin aria-hidden className="h-4 w-4 shrink-0" />
              <span dir="auto">{address}</span>
            </li>
          )}
        </ul>
        <p className="mt-3">
          <Link to="/inquire" className="font-medium underline">
            {t('pages.home.cta_enquiry')}
          </Link>
        </p>
      </HomeSection>
    </div>
  );
}

function HomeSection({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
