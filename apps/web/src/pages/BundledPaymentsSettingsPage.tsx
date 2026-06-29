import { Navigate } from 'react-router-dom';
import { useTenant } from '@/hooks/useTenant';
import { tenantUsesBundledPayments } from '@/lib/tenantProviderRouting';
import { BundledPaymentsSettings } from '@/features/settings/components/BundledPaymentsSettings';

/** Single setup route — generic shell; admin picks Grow or iCount equally. */
export default function BundledPaymentsSettingsPage() {
  const tenant = useTenant();

  if (!tenantUsesBundledPayments(tenant)) {
    return <Navigate to="/admin/setup/payments" replace />;
  }

  return (
    <div className="p-6">
      <BundledPaymentsSettings />
    </div>
  );
}
