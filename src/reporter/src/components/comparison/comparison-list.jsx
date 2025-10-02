import ComparisonCard from './comparison-card.jsx';
import { NoResults } from '../dashboard/empty-state.jsx';

export default function ComparisonList({
  comparisons,
  onAccept,
  onReject,
  loadingStates,
}) {
  if (!comparisons || comparisons.length === 0) {
    return <NoResults />;
  }

  return (
    <div className="space-y-6">
      {comparisons.map(comparison => (
        <ComparisonCard
          key={comparison.name}
          comparison={comparison}
          onAccept={onAccept}
          onReject={onReject}
          userAction={loadingStates[comparison.name]}
        />
      ))}
    </div>
  );
}
