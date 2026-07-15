import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AddToCalendarActions } from '@/features/scheduling/components/AddToCalendarActions';
import { formatAppointmentWhen } from '@/features/scheduling/lib/formatAppointmentWhen';
import type { AppointmentCalendarDetails } from '@/features/enrolment/lib/checkoutBootstrapTypes';

interface EnrolmentPaymentSuccessProps {
  appointment?: AppointmentCalendarDetails | null;
  onClose: () => void;
  closeLabel: string;
}

export function EnrolmentPaymentSuccess({
  appointment,
  onClose,
  closeLabel,
}: EnrolmentPaymentSuccessProps) {
  const { t, i18n } = useTranslation();

  const calendarEvent = appointment
    ? {
        title: appointment.serviceName,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        location: appointment.location,
        description: appointment.schoolName
          ? t('scheduling.book.calendar_event_description', { schoolName: appointment.schoolName })
          : undefined,
      }
    : null;

  return (
    <div className="max-w-lg mx-auto p-6 space-y-4 text-center">
      <h1 className="text-2xl font-bold">{t('pages.enrol_pay.already_paid_title')}</h1>
      <p className="text-gray-600">
        {appointment
          ? t('pages.enrol_pay.already_paid_appointment_desc')
          : t('pages.enrol_pay.already_paid_desc')}
      </p>
      {appointment && (
        <p className="font-medium text-gray-800">
          {formatAppointmentWhen(appointment.startsAt, i18n.language)}
        </p>
      )}
      {calendarEvent && <AddToCalendarActions event={calendarEvent} />}
      <Button variant="primary" className="w-full" onClick={onClose}>
        {closeLabel}
      </Button>
    </div>
  );
}
