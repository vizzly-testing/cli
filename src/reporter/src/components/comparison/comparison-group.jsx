import { useState } from 'react';
import ComparisonCard from './comparison-card.jsx';

/**
 * Comparison group component that displays multiple variants of the same screenshot
 * Matches cloud product's grouped screenshot display
 */
export default function ComparisonGroup({
  group,
  onAccept,
  onReject,
  loadingStates,
}) {
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);

  if (!group || !group.comparisons || group.comparisons.length === 0) {
    return null;
  }

  // Get the currently selected variant
  const selectedComparison =
    group.comparisons[selectedVariantIndex] || group.comparisons[0];

  return (
    <ComparisonCard
      comparison={selectedComparison}
      onAccept={onAccept}
      onReject={onReject}
      userAction={loadingStates[selectedComparison.id]}
      // Pass variant selector props when multiple variants exist
      variantSelector={
        group.comparisons.length > 1
          ? {
              group,
              selectedIndex: selectedVariantIndex,
              onSelect: setSelectedVariantIndex,
            }
          : null
      }
    />
  );
}
