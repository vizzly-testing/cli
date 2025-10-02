import { useState } from 'react';
import SmartImage from '../../ui/smart-image.jsx';

export default function OverlayViewer({ comparison }) {
  let [showDiff, setShowDiff] = useState(true);

  return (
    <div
      className="overlay-container cursor-pointer"
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
  );
}
