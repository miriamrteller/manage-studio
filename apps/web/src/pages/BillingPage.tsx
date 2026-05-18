import { BillingAccountsList } from '@/features/billing/components';

/**
 * BillingPage: Container for billing accounts management
 * - Acts as a route container, not a logic container
 * - Delegates all UI and logic to BillingAccountsList component
 * - WCAG: Semantic structure maintained in child components
 */
export default function BillingPage() {
  return <BillingAccountsList />;
}
