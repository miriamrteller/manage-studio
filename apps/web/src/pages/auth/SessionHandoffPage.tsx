import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  establishSessionFromAuthCallback,
  captureAuthCallbackUrl,
  clearAuthCallbackUrl,
} from '@/lib/authCallback';

export default function SessionHandoffPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Capture URL parts before anything can strip them
      const url = captureAuthCallbackUrl();
      const result = await establishSessionFromAuthCallback(url);

      if (cancelled) return;

      if (result.ok) {
        clearAuthCallbackUrl();
        navigate('/dashboard', { replace: true });
      } else {
        setError(result.message);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full rounded-md bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">
            Could not sign you in automatically: {error}
          </p>
          <a
            href="/login"
            className="mt-4 inline-block text-sm text-indigo-600 hover:underline"
          >
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Setting up your studio…</p>
    </div>
  );
}
