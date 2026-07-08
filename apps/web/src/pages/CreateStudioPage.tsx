import { useState } from 'react';
import {
  useCreateStudio,
  type CreateStudioPlan,
  type CreateStudioVertical,
  type CreateStudioFormData,
} from '@/features/auth/hooks/useCreateStudio';

// Derive a URL-safe subdomain slug from studio name
function toSubdomainSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const PLAN_OPTIONS: { value: CreateStudioPlan; label: string; description: string }[] = [
  {
    value: 'essential',
    label: 'Essential',
    description: 'Appointment-based bookings, client billing, single or deposit payments.',
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Class enrolment, multi-term calendars, family billing, student management.',
  },
];

const VERTICAL_OPTIONS: { value: CreateStudioVertical; label: string; plans: CreateStudioPlan[] }[] = [
  { value: 'dance_studio', label: 'Dance Studio', plans: ['essential', 'professional'] },
  { value: 'music_school', label: 'Music School', plans: ['essential', 'professional'] },
  { value: 'martial_arts', label: 'Martial Arts', plans: ['essential', 'professional'] },
  { value: 'fitness_studio', label: 'Fitness Studio', plans: ['essential', 'professional'] },
  { value: 'beauty_clinic', label: 'Beauty Clinic', plans: ['essential'] },
  { value: 'photography_studio', label: 'Photography Studio', plans: ['essential'] },
  { value: 'yoga_studio', label: 'Yoga Studio', plans: ['essential', 'professional'] },
  { value: 'tutor', label: 'Tutoring', plans: ['professional'] },
];

export default function CreateStudioPage() {
  const { createStudio, loading, error } = useCreateStudio();

  const [step, setStep] = useState<1 | 2 | 3>(1); // 1=details, 2=plan, 3=vertical
  const [studioName, setStudioName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<CreateStudioPlan | null>(null);
  const [vertical, setVertical] = useState<CreateStudioVertical | null>(null);

  const availableVerticals = plan
    ? VERTICAL_OPTIONS.filter((v) => v.plans.includes(plan))
    : [];

  const handleStudioNameChange = (name: string) => {
    setStudioName(name);
    setSubdomain(toSubdomainSlug(name));
  };

  const handlePlanSelect = (selected: CreateStudioPlan) => {
    setPlan(selected);
    setVertical(null); // reset vertical when plan changes
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!plan || !vertical) return;
    const formData: CreateStudioFormData = {
      studioName,
      subdomain,
      firstName,
      lastName,
      email,
      password,
      plan,
      vertical,
    };
    const result = await createStudio(formData);
    if (result.ok) {
      window.location.href = result.redirectUrl;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="w-full max-w-lg space-y-8">
        <div>
          <h1 className="text-center text-2xl font-bold tracking-tight text-gray-900">
            Create your studio
          </h1>
          <p className="mt-2 text-center text-sm text-gray-600">
            Step {step} of 3
          </p>
        </div>

        {/* Step 1 — Studio + owner details */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="create-studio-name" className="block text-sm font-medium text-gray-700">
                Studio name
              </label>
              <input
                id="create-studio-name"
                type="text"
                value={studioName}
                onChange={(e) => handleStudioNameChange(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Bella Dance Academy"
              />
              {subdomain && (
                <p className="mt-1 text-xs text-gray-400">
                  Studio URL: <span className="font-mono">{subdomain}.localhost:5173</span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="create-studio-first-name" className="block text-sm font-medium text-gray-700">
                  First name
                </label>
                <input
                  id="create-studio-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="create-studio-last-name" className="block text-sm font-medium text-gray-700">
                  Last name
                </label>
                <input
                  id="create-studio-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="create-studio-email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="create-studio-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="create-studio-password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="create-studio-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="button"
              disabled={!studioName || !firstName || !lastName || !email || !password}
              onClick={() => setStep(2)}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
            <p className="text-center text-sm text-gray-500">
              Already have a studio?{' '}
              <a href="/login" className="font-medium text-indigo-600 hover:underline">
                Sign in
              </a>
            </p>
          </div>
        )}

        {/* Step 2 — Plan selection */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">Choose your plan</h2>
            <div className="grid gap-4">
              {PLAN_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePlanSelect(option.value)}
                  className="w-full rounded-lg border-2 border-gray-200 p-4 text-left hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
                >
                  <p className="font-semibold text-gray-900">{option.label}</p>
                  <p className="mt-1 text-sm text-gray-500">{option.description}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm text-gray-500 hover:underline"
            >
              ← Back
            </button>
          </div>
        )}

        {/* Step 3 — Vertical selection */}
        {step === 3 && plan && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">What type of studio?</h2>
            <div className="grid grid-cols-2 gap-3">
              {availableVerticals.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVertical(option.value)}
                  className={`rounded-lg border-2 p-3 text-left text-sm font-medium transition-colors ${
                    vertical === option.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {error && (
              <div className="rounded-md bg-red-50 p-4" role="alert">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}
            <button
              type="button"
              disabled={!vertical || loading}
              onClick={handleSubmit}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating your studio…' : 'Create studio'}
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm text-gray-500 hover:underline"
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
