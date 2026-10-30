import { useParams } from 'react-router-dom';
import { JobDetail } from '@/features/jobs/components/JobDetail';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <JobDetail engagementId={id} />;
}
