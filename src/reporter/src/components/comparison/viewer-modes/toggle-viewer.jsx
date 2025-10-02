import { useState } from 'react';
import SmartImage from '../../ui/smart-image.jsx';

export default function ToggleViewer({ comparison }) {
  let [showBaseline, setShowBaseline] = useState(true);

  return (
    <div className="toggle-container">
      <SmartImage
        className="toggle-image"
        src={showBaseline ? comparison.baseline : comparison.current}
        alt={showBaseline ? 'Baseline' : 'Current'}
        onClick={() => setShowBaseline(!showBaseline)}
        style={{ cursor: 'pointer' }}
      />
      <div className="toggle-label">
        {showBaseline ? 'Baseline' : 'Current'} (click to toggle)
      </div>
    </div>
  );
}
