import SmartImage from '../../ui/smart-image.jsx';

export default function SideBySideViewer({ comparison }) {
  return (
    <div className="side-by-side-container">
      <div className="side-by-side-image">
        <SmartImage src={comparison.baseline} alt="Baseline" />
        <label>Baseline</label>
      </div>
      <div className="side-by-side-image">
        <SmartImage src={comparison.current} alt="Current" />
        <label>Current</label>
      </div>
    </div>
  );
}
