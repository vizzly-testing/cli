import { useState } from 'react';
import SmartImage from '../../ui/smart-image.jsx';

export default function ToggleViewer({ comparison }) {
  let [showBaseline, setShowBaseline] = useState(true);

  return (
    <div className="toggle-container">
      <div className="relative">
        <SmartImage
          className="toggle-image"
          src={showBaseline ? comparison.baseline : comparison.current}
          alt={showBaseline ? 'Baseline' : 'Current'}
          onClick={() => setShowBaseline(!showBaseline)}
          style={{ cursor: 'pointer' }}
        />
        {/* Mobile-friendly toggle overlay */}
        <button
          onClick={() => setShowBaseline(!showBaseline)}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur-sm border border-gray-600 text-white px-4 py-2 rounded-full text-sm font-medium touch-manipulation hover:bg-gray-800 active:bg-gray-700 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${showBaseline ? 'bg-blue-400' : 'bg-green-400'}`}
            />
            {showBaseline ? 'Baseline' : 'Current'}
            <span className="text-gray-400 text-xs">(tap to toggle)</span>
          </span>
        </button>
      </div>
    </div>
  );
}
