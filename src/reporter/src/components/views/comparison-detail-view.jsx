import { useCallback, useMemo } from 'react';
import { useLocation, useRoute } from 'wouter';
import {
  useAcceptBaseline,
  useRejectBaseline,
  useReportData,
} from '../../hooks/queries/use-tdd-queries.js';
import FullscreenViewer from '../comparison/fullscreen-viewer.jsx';

/**
 * Route-driven comparison detail view
 * The route parameter :id determines which comparison to show
 */
export default function ComparisonDetailView() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/comparison/:id');

  const { data: reportData } = useReportData();
  const acceptMutation = useAcceptBaseline();
  const rejectMutation = useRejectBaseline();

  // Memoize comparisons array to prevent dependency warnings
  const comparisons = useMemo(
    () => reportData?.comparisons || [],
    [reportData?.comparisons]
  );

  // Find the comparison by ID from route params
  // Uses stable IDs (id, signature, or name) - not array indices which change with filters
  const comparison = useMemo(() => {
    const targetId = params?.id ? decodeURIComponent(params.id) : null;
    if (!targetId || comparisons.length === 0) {
      return null;
    }

    // Find by stable ID (id, signature, or name)
    return comparisons.find(
      c => c.id === targetId || c.signature === targetId || c.name === targetId
    );
  }, [params, comparisons]);

  // Simple navigation - just change the URL using stable IDs
  const handleNavigate = useCallback(
    targetComparison => {
      const id =
        targetComparison.id ||
        targetComparison.signature ||
        targetComparison.name;
      if (id) {
        setLocation(`/comparison/${encodeURIComponent(id)}`);
      }
    },
    [setLocation]
  );

  const handleClose = useCallback(() => {
    setLocation('/');
  }, [setLocation]);

  const handleAccept = useCallback(
    id => {
      acceptMutation.mutate(id);
    },
    [acceptMutation]
  );

  const handleReject = useCallback(
    id => {
      rejectMutation.mutate(id);
    },
    [rejectMutation]
  );

  // If no comparison found, show not found state
  if (!comparison) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-white font-medium mb-2">
            Comparison not found
          </div>
          <p className="text-sm text-gray-400 mb-4">
            ID: {params?.id || 'none'}
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Return to list
          </button>
        </div>
      </div>
    );
  }

  return (
    <FullscreenViewer
      comparison={comparison}
      comparisons={comparisons}
      onClose={handleClose}
      onAccept={handleAccept}
      onReject={handleReject}
      onNavigate={handleNavigate}
    />
  );
}
