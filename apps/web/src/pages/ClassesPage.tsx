import { ClassesList } from '../components/Classes';

/**
 * ClassesPage: Light composition page
 * - Acts as a route container, not a logic container
 * - Delegates all logic to useClasses hook (in ClassesList)
 * - Delegates all UI to ClassesList component
 * - WCAG: Semantic structure maintained in child components
 */

export function ClassesPage() {
  return <ClassesList />;
}
