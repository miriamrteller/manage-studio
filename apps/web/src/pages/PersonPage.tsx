import { useNavigate, useParams } from 'react-router-dom';
import { StudentSlideOver } from '@/features/students/components/StudentSlideOver';

/**
 * A person's own page (/admin/people/:personId): everything about them, with links to each
 * shoot, class, booking, family and payment, and back here from those pages.
 */
export default function PersonPage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  if (!personId) return null;
  return <StudentSlideOver personId={personId} variant="page" onClose={() => navigate('/admin/people')} />;
}
