import { useState } from 'react';
import SmartImage from '../../ui/smart-image.jsx';

export default function OverlayViewer({ comparison }) {
  let [showDiff, setShowDiff] = useState(true);

  return (
    <div className="relative">
      <div
        className="overlay-container cursor-pointer touch-manipulation"
        onClick={() => setShowDiff(!showDiff)}
        title="Click to toggle diff overlay"
      >
        <SmartImage
          className="current-image"
          src={comparison.current}
          alt="Current"
        />
        <SmartImage
          className="baseline-image"
          src={comparison.baseline}
          alt="Baseline"
        />
        {comparison.diff && (
          <SmartImage
            className="diff-image"
            src={comparison.diff}
            alt="Diff"
            style={{ opacity: showDiff ? 1 : 0 }}
          />
        )}
      </div>
      {/* Mobile-friendly diff toggle indicator */}
      {comparison.diff && (
        <button
          onClick={() => setShowDiff(!showDiff)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-sm border border-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium touch-manipulation hover:bg-gray-800 active:bg-gray-700 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${showDiff ? 'bg-red-400' : 'bg-gray-400'}`}
            />
            Diff {showDiff ? 'On' : 'Off'}
            <span className="text-gray-400 text-xs hidden sm:inline">
              (tap to toggle)
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
