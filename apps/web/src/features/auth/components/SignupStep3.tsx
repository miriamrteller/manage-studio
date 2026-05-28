'use client';

import { OtpCodeForm } from '@/components/shared/OtpCodeForm';

interface SignupStep3Props {
  onSubmit: (data: { code: string }) => void;
  loading?: boolean;
}

export default function SignupStep3({ onSubmit, loading }: SignupStep3Props) {
  return <OtpCodeForm onSubmit={onSubmit} loading={loading} />;
}
