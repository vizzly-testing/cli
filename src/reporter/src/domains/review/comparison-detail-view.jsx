import { useCallback, useLayoutEffect, useRef } from 'react';
import { useLocation, useRoute } from 'wouter';
import FullscreenViewer from './fullscreen-viewer.jsx';
import {
  useAcceptBaseline,
  useComparison,
  useDeleteComparison,
  useRejectBaseline,
  useReportData,
} from './review.queries.js';

/**
 * Route-driven comparison detail view
 * The route parameter :id determines which comparison to show
 */
export default function ComparisonDetailView() {
  let [, setLocation] = useLocation();
  let [, params] = useRoute('/comparison/:id');

  let { data: reportData } = useReportData();
  let acceptMutation = useAcceptBaseline();
  let rejectMutation = useRejectBaseline();
  let deleteMutation = useDeleteComparison();

  let comparisons = reportData?.comparisons || [];
  let targetId = params?.id ? decodeURIComponent(params.id) : null;
  // Keep async decisions tied to the route, even if SSE removes the capture.
  let routeSelection = useRef(null);
  useLayoutEffect(() => {
    routeSelection.current = { id: targetId };
    return () => {
      routeSelection.current = null;
    };
  }, [targetId]);
  let isCurrentComparison = useCallback(
    () => routeSelection.current?.id === targetId,
    [targetId]
  );
  let lightComparison = comparisons.find(
    item =>
      item.id === targetId ||
      item.signature === targetId ||
      item.name === targetId
  );

  // Fetch full comparison details on-demand (includes heavy fields like diffClusters)
  let { data: fullComparison } = useComparison(lightComparison?.id);

  // SSE owns the current result; the detail request supplies the heavier analysis.
  let comparison =
    lightComparison && fullComparison
      ? {
          ...lightComparison,
          diffClusters: fullComparison.diffClusters,
          intensityStats: fullComparison.intensityStats,
          boundingBox: fullComparison.boundingBox,
        }
      : lightComparison;

  // Simple navigation - just change the URL using stable IDs
  let handleNavigate = useCallback(
    targetComparison => {
      let id =
        targetComparison.id ||
        targetComparison.signature ||
        targetComparison.name;
      if (id) {
        routeSelection.current = { id };
        setLocation(`/comparison/${encodeURIComponent(id)}`);
      }
    },
    [setLocation]
  );

  let handleClose = useCallback(() => {
    routeSelection.current = null;
    setLocation('/');
  }, [setLocation]);

  // If no comparison found, show not found state
  if (!comparison) {
    return (
      <div className="fixed inset-0 bg-[var(--vz-bg)] z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-[var(--text-primary)] font-medium mb-2">
            Comparison not found
          </div>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            ID: {params?.id || 'none'}
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="text-[var(--accent-media)] hover:text-[var(--accent-media)] font-medium transition-colors"
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
      isCurrentComparison={isCurrentComparison}
      onAccept={acceptMutation.mutateAsync}
      onReject={rejectMutation.mutateAsync}
      onDelete={deleteMutation.mutateAsync}
      onNavigate={handleNavigate}
    />
  );
}
