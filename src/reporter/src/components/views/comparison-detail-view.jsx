import { useMemo, useCallback } from 'react';
import { useLocation, useRoute } from 'wouter';
import useBaselineActions from '../../hooks/use-baseline-actions.js';
import FullscreenViewer from '../comparison/fullscreen-viewer.jsx';

/**
 * Route-driven comparison detail view
 * The route parameter :id determines which comparison to show
 */
export default function ComparisonDetailView({ reportData, setReportData }) {
  let [, setLocation] = useLocation();
  let [, params] = useRoute('/comparison/:id');

  let { accept, reject, loadingStates } = useBaselineActions(setReportData);

  // Memoize comparisons array to prevent dependency warnings
  let comparisons = useMemo(
    () => reportData?.comparisons || [],
    [reportData?.comparisons]
  );

  // Find the comparison by ID from route params
  // Support multiple ID formats: actual id, signature, or index-based
  let { comparison, currentIndex } = useMemo(() => {
    let targetId = params?.id;
    if (!targetId || comparisons.length === 0) {
      return { comparison: null, currentIndex: -1 };
    }

    // Try to find by various ID formats
    let index = comparisons.findIndex((c, i) => {
      // Check actual id
      if (c.id === targetId) return true;
      // Check signature
      if (c.signature === targetId) return true;
      // Check index-based id
      if (`comparison-${i}` === targetId) return true;
      return false;
    });

    return {
      comparison: index >= 0 ? comparisons[index] : null,
      currentIndex: index,
    };
  }, [params, comparisons]);

  // Simple navigation - just change the URL
  let handleNavigate = useCallback(
    targetComparison => {
      // Find the index of the target comparison to generate a stable URL
      let index = comparisons.findIndex(c => c === targetComparison);
      if (index >= 0) {
        // Prefer actual id, then signature, then index-based
        let id =
          targetComparison.id ||
          targetComparison.signature ||
          `comparison-${index}`;
        setLocation(`/comparison/${id}`);
      }
    },
    [comparisons, setLocation]
  );

  let handleClose = useCallback(() => {
    setLocation('/');
  }, [setLocation]);

  // Get the stable ID for current comparison (for actions)
  let comparisonId = useMemo(() => {
    if (!comparison) return null;
    return (
      comparison.id || comparison.signature || `comparison-${currentIndex}`
    );
  }, [comparison, currentIndex]);

  // Handle accept/reject with the stable ID
  let handleAccept = useCallback(
    id => {
      accept(id);
    },
    [accept]
  );

  let handleReject = useCallback(
    id => {
      reject(id);
    },
    [reject]
  );

  // If no comparison found, show not found state
  if (!comparison) {
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="text-lg mb-2">Comparison not found</div>
          <p className="text-sm text-gray-500 mb-4">
            ID: {params?.id || 'none'}
          </p>
          <button
            onClick={handleClose}
            className="text-blue-400 hover:text-blue-300"
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
      userAction={loadingStates[comparisonId]}
    />
  );
}
