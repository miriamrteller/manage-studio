import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import {
  WALKTHROUGH_SCENARIOS,
  fetchPipeline,
  type PipelineSummary,
} from '@/features/finance/lib/walkthroughPipeline';

const WALKTHROUGH_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_FINANCE_WALKTHROUGH === 'true';

function PipelineRow({ label, value }: { label: string; value: string | null | boolean }) {
  const display = typeof value === 'boolean' ? (value ? 'yes' : 'no') : value ?? '—';
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-mono">{display}</dd>
    </div>
  );
}

function PipelinePanel({ summary }: { summary: PipelineSummary }) {
  return (
    <dl className="rounded-lg border border-gray-200 p-3">
      <PipelineRow label="Stage" value={summary.stage} />
      <PipelineRow label="Engagement status" value={summary.engagementStatus} />
      <PipelineRow label="Payment status" value={summary.paymentStatus} />
      <PipelineRow label="Payment id" value={summary.paymentId} />
      <PipelineRow label="Document queue" value={summary.queueStatus} />
      <PipelineRow label="Document issued" value={summary.documentIssued} />
      <PipelineRow label="Document number" value={summary.documentNumber} />
      <PipelineRow label="Last email action" value={summary.lastEmailAction} />
    </dl>
  );
}

/**
 * Dev-only finance walkthrough: step through every seeded flow and watch the
 * payment → document → email pipeline. Gated to DEV or VITE_ENABLE_FINANCE_WALKTHROUGH;
 * the route guard additionally requires an admin session.
 */
export default function FinanceWalkthroughPage() {
  const [engagementId, setEngagementId] = useState('');
  const [offeringId, setOfferingId] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const pipeline = useQuery({
    queryKey: ['finance-walkthrough-pipeline', engagementId],
    queryFn: () => fetchPipeline(engagementId.trim()),
    enabled: false,
  });

  const issueDocument = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase.functions.invoke('issue-document', {
        body: { payment_id: paymentId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setActionMessage('issue-document invoked.');
      void pipeline.refetch();
    },
    onError: (err: Error) => setActionMessage(err.message),
  });

  const simulateMock = useMutation({
    mutationFn: async (scenario: 'success' | 'decline') => {
      const { data, error } = await supabase.functions.invoke('confirm-mock-payment', {
        body: {
          engagement_id: engagementId.trim(),
          offering_id: offeringId.trim(),
          scenario,
        },
      });
      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error));
      }
      return data;
    },
    onSuccess: (_data, scenario) => {
      setActionMessage(`Mock ${scenario} submitted.`);
      void pipeline.refetch();
    },
    onError: (err: Error) => setActionMessage(err.message),
  });

  if (!WALKTHROUGH_ENABLED) {
    return <Navigate to="/admin/setup" replace />;
  }

  const summary = pipeline.data;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <header>
        <h1 className="text-xl font-bold">Finance walkthrough</h1>
        <p className="text-sm text-gray-500">
          Dev-only tool to step through seeded finance flows and inspect the pipeline.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-700">Seeded scenarios (creativeballet)</h2>
        <ul className="divide-y border border-gray-200 rounded-lg">
          {WALKTHROUGH_SCENARIOS.map((s) => (
            <li key={s.id} className="p-3">
              <p className="font-medium">{s.label}</p>
              <p className="text-xs text-gray-500">{s.flow}</p>
              <p className="text-xs text-gray-400">{s.howTo}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-gray-700">Pipeline inspector</h2>
        <label className="block text-sm">
          Engagement id
          <input
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
            value={engagementId}
            onChange={(e) => setEngagementId(e.target.value)}
            placeholder="00000000-0000-0000-0000-0000000010xx"
          />
        </label>
        <label className="block text-sm">
          Offering id (for mock simulate)
          <input
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm"
            value={offeringId}
            onChange={(e) => setOfferingId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000313"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!engagementId.trim() || pipeline.isFetching}
            isLoading={pipeline.isFetching}
            onClick={() => void pipeline.refetch()}
          >
            Inspect pipeline
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!engagementId.trim() || !offeringId.trim() || simulateMock.isPending}
            onClick={() => simulateMock.mutate('success')}
          >
            Simulate mock success
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!engagementId.trim() || !offeringId.trim() || simulateMock.isPending}
            onClick={() => simulateMock.mutate('decline')}
          >
            Simulate mock decline
          </Button>
          {summary?.paymentId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={issueDocument.isPending}
              onClick={() => issueDocument.mutate(summary.paymentId as string)}
            >
              Trigger issue-document
            </Button>
          )}
        </div>

        {actionMessage && (
          <p className="text-sm text-gray-600" role="status">
            {actionMessage}
          </p>
        )}
        {pipeline.error && (
          <p className="text-sm text-red-600">{(pipeline.error as Error).message}</p>
        )}
        {summary && <PipelinePanel summary={summary} />}
      </section>
    </div>
  );
}
