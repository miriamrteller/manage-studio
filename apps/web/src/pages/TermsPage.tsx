import { TermsList } from '@/features/terms/components';

/**
 * TermsPage: Container for terms management
 * - Acts as a route container, not a logic container
 * - Delegates all UI and logic to TermsList component
 * - WCAG: Semantic structure maintained in child components
 */
export default function TermsPage() {
  return <TermsList />;
}
