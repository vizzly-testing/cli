import { useCallback } from 'react';
import { CheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import {
  useReportData,
  useAcceptAllBaselines,
  useResetBaselines,
} from '../../hooks/queries/use-tdd-queries.js';
import DashboardStats from '../dashboard/dashboard-stats.jsx';
import { useToast } from '../ui/toast.jsx';

export default function StatsView() {
  let { addToast, confirm } = useToast();

  // Use TanStack Query for data
  let { data: reportData, isLoading, refetch } = useReportData();
  let acceptAllMutation = useAcceptAllBaselines();
  let resetMutation = useResetBaselines();

  let summary = reportData?.summary;
  let comparisons = reportData?.comparisons;
  let baseline = reportData?.baseline;

  // Check if there are any changes to accept
  let hasChanges = comparisons?.some(
    c => c.status === 'failed' || c.status === 'new'
  );

  // Count new screenshots
  let newCount = comparisons?.filter(c => c.status === 'new').length || 0;

  let handleAcceptAll = useCallback(async () => {
    let confirmed = await confirm(
      'This will update all failed and new screenshots.',
      'Accept all changes as new baselines?'
    );

    if (!confirmed) return;

    acceptAllMutation.mutate(undefined, {
      onSuccess: () => {
        addToast('All baselines accepted successfully', 'success');
      },
      onError: err => {
        console.error('Failed to accept all baselines:', err);
        addToast('Failed to accept all baselines. Please try again.', 'error');
      },
    });
  }, [acceptAllMutation, addToast, confirm]);

  let handleReset = useCallback(async () => {
    let confirmed = await confirm(
      'This will delete all baseline images and clear comparison history.',
      'Reset all baselines?'
    );

    if (!confirmed) return;

    resetMutation.mutate(undefined, {
      onSuccess: () => {
        addToast('Baselines reset successfully', 'success');
      },
      onError: err => {
        console.error('Failed to reset baselines:', err);
        addToast('Failed to reset baselines. Please try again.', 'error');
      },
    });
  }, [resetMutation, addToast, confirm]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">
          Statistics Overview
        </h1>
        <p className="text-gray-400">Visual regression testing statistics</p>
      </div>

      <DashboardStats summary={summary} baseline={baseline?.buildName} />

      {/* Baseline Info Card */}
      {baseline && (
        <div className="mb-6 bg-slate-800/50 rounded-lg border border-slate-700 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-400 mb-1">Current Baseline</div>
              <div className="text-white font-medium">
                {baseline.buildName || 'default'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-1">Created</div>
              <div className="text-white font-medium">
                {baseline.createdAt
                  ? new Date(baseline.createdAt).toLocaleString()
                  : 'Unknown'}
              </div>
            </div>
          </div>
          {newCount > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-600">
              <div className="text-sm text-amber-400">
                {newCount} new screenshot{newCount !== 1 ? 's' : ''} without
                baseline
              </div>
            </div>
          )}
        </div>
      )}

      {/* Baseline Management Actions */}
      <div className="mt-8 bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Baseline Management
        </h2>
        <p className="text-gray-400 mb-6">
          Manage your visual regression baselines. Accept changes to update
          baselines or reset to restore previous state.
        </p>

        <div className="flex gap-4">
          <button
            onClick={handleAcceptAll}
            disabled={!hasChanges || acceptAllMutation.isPending || isLoading}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckIcon className="w-5 h-5" />
            <span>
              {acceptAllMutation.isPending
                ? 'Accepting...'
                : hasChanges
                  ? 'Accept All Changes'
                  : 'No Changes to Accept'}
            </span>
          </button>

          <button
            onClick={handleReset}
            disabled={resetMutation.isPending || isLoading}
            className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:bg-gray-600 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowPathIcon className="w-5 h-5" />
            <span>
              {resetMutation.isPending ? 'Resetting...' : 'Reset Baselines'}
            </span>
          </button>

          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="ml-auto inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>
    </div>
  );
}
