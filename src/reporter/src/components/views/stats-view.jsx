import {
  ArrowPathIcon,
  CheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { useCallback } from 'react';
import {
  useAcceptAllBaselines,
  useReportData,
  useResetBaselines,
} from '../../hooks/queries/use-tdd-queries.js';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  HealthRing,
} from '../design-system/index.js';
import { useToast } from '../ui/toast.jsx';

function StatCard({ icon: Icon, label, value, subvalue, variant, iconColor }) {
  return (
    <Card variant={variant} hover={false}>
      <CardBody padding="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
              {label}
            </p>
            <p className="text-2xl font-semibold font-mono text-white">
              {value}
            </p>
            {subvalue && (
              <p className="text-xs text-slate-400 mt-1">{subvalue}</p>
            )}
          </div>
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}
          >
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function StatsView() {
  const { addToast, confirm } = useToast();

  // Use TanStack Query for data
  const { data: reportData, isLoading, refetch } = useReportData();
  const acceptAllMutation = useAcceptAllBaselines();
  const resetMutation = useResetBaselines();

  const comparisons = reportData?.comparisons;
  const baseline = reportData?.baseline;

  // Calculate stats
  const total = comparisons?.length || 0;
  const passed = comparisons?.filter(c => c.status === 'passed').length || 0;
  const failed = comparisons?.filter(c => c.status === 'failed').length || 0;
  const newCount = comparisons?.filter(c => c.status === 'new').length || 0;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  // Check if there are any changes to accept
  const hasChanges = comparisons?.some(
    c => c.status === 'failed' || c.status === 'new'
  );

  const handleAcceptAll = useCallback(async () => {
    const confirmed = await confirm(
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

  const handleReset = useCallback(async () => {
    const confirmed = await confirm(
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
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Statistics</h1>
        <p className="text-slate-400 mt-1">
          Visual regression testing overview
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Health Ring Card */}
        <Card hover={false}>
          <CardBody className="flex flex-col items-center justify-center py-8">
            <HealthRing value={passRate} label="Pass Rate" />
            <p className="text-sm text-slate-400 mt-4">
              {passed} of {total} screenshots passing
            </p>
          </CardBody>
        </Card>

        {/* 2x2 Stats Grid */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <StatCard
            icon={PhotoIcon}
            label="Total Screenshots"
            value={total}
            iconColor="bg-slate-700/50 text-slate-400"
          />
          <StatCard
            icon={CheckIcon}
            label="Passed"
            value={passed}
            variant="success"
            iconColor="bg-emerald-500/10 text-emerald-400"
          />
          <StatCard
            icon={ExclamationTriangleIcon}
            label="Failed"
            value={failed}
            variant={failed > 0 ? 'danger' : undefined}
            iconColor="bg-red-500/10 text-red-400"
          />
          <StatCard
            icon={SparklesIcon}
            label="New"
            value={newCount}
            variant={newCount > 0 ? 'info' : undefined}
            iconColor="bg-blue-500/10 text-blue-400"
          />
        </div>
      </div>

      {/* Baseline Info */}
      {baseline && (
        <Card hover={false}>
          <CardHeader
            icon={ClockIcon}
            title="Current Baseline"
            iconColor="bg-amber-500/10 text-amber-400"
            actions={
              newCount > 0 && (
                <Badge variant="warning" dot>
                  {newCount} new without baseline
                </Badge>
              )
            }
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Build Name
                </p>
                <p className="text-white font-medium">
                  {baseline.buildName || 'default'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                  Created
                </p>
                <p className="text-white font-medium">
                  {baseline.createdAt
                    ? new Date(baseline.createdAt).toLocaleString()
                    : 'Unknown'}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Baseline Management */}
      <Card hover={false}>
        <CardHeader
          title="Baseline Management"
          description="Accept changes to update baselines or reset to restore previous state"
        />
        <CardFooter className="flex flex-wrap gap-3">
          <Button
            variant="success"
            onClick={handleAcceptAll}
            loading={acceptAllMutation.isPending}
            disabled={!hasChanges || isLoading}
            icon={CheckIcon}
          >
            {hasChanges ? 'Accept All Changes' : 'No Changes to Accept'}
          </Button>

          <Button
            variant="secondary"
            onClick={handleReset}
            loading={resetMutation.isPending}
            disabled={isLoading}
            icon={ArrowPathIcon}
          >
            Reset Baselines
          </Button>

          <Button
            variant="ghost"
            onClick={() => refetch()}
            loading={isLoading}
            icon={ArrowPathIcon}
            className="ml-auto"
          >
            Refresh
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
