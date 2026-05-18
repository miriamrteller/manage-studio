import { LevelsList } from '@/features/levels/components';

/**
 * LevelsPage: Container for levels management
 * - Acts as a route container, not a logic container
 * - Delegates all UI and logic to LevelsList component
 * - WCAG: Semantic structure maintained in child components
 */
export default function LevelsPage() {
  return <LevelsList />;
}
