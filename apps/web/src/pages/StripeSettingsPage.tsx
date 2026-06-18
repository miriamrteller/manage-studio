import { Navigate } from 'react-router-dom';

/** Legacy route — payment settings moved to provider-agnostic page. */
export default function StripeSettingsPage() {
  return <Navigate to="/admin/setup/payments" replace />;
}
