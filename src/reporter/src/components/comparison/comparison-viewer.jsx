import OverlayViewer from './viewer-modes/overlay-viewer.jsx';
import ToggleViewer from './viewer-modes/toggle-viewer.jsx';
import OnionViewer from './viewer-modes/onion-viewer.jsx';
import SideBySideViewer from './viewer-modes/side-by-side-viewer.jsx';
import SmartImage from '../ui/smart-image.jsx';
import { VIEW_MODES } from '../../utils/constants.js';

export default function ComparisonViewer({ comparison, viewMode }) {
  // For new screenshots, just show the current image (no baseline exists yet)
  if (comparison.status === 'new' || comparison.status === 'baseline-created') {
    return (
      <div className="comparison-viewer new-baseline">
        <div className="text-center py-8">
          <p className="text-gray-400 text-sm mb-4">
            First screenshot - creating new baseline
          </p>
          <SmartImage
            src={comparison.current}
            alt="New baseline screenshot"
            className="mx-auto max-w-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="comparison-viewer" data-mode={viewMode}>
      {viewMode === VIEW_MODES.OVERLAY && (
        <div className="mode-container overlay-mode">
          <OverlayViewer comparison={comparison} />
        </div>
      )}

      {viewMode === VIEW_MODES.TOGGLE && (
        <div className="mode-container toggle-mode">
          <ToggleViewer comparison={comparison} />
        </div>
      )}

      {viewMode === VIEW_MODES.ONION && (
        <div className="mode-container onion-mode">
          <OnionViewer comparison={comparison} />
        </div>
      )}

      {viewMode === VIEW_MODES.SIDE_BY_SIDE && (
        <div className="mode-container side-by-side-mode">
          <SideBySideViewer comparison={comparison} />
        </div>
      )}
    </div>
  );
}
