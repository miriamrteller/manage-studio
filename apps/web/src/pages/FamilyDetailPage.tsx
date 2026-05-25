import { useParams } from 'react-router-dom';
import { FamilyDetail } from '@/features/families/components/FamilyDetail';

export default function FamilyDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <FamilyDetail id={id} />;
}
