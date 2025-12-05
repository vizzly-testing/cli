import { useMemo } from 'react';
import { NoResults } from '../dashboard/empty-state.jsx';
import ComparisonGroup from './comparison-group.jsx';

/**
 * Group comparisons by screenshot name to create variant groups
 */
function groupComparisons(comparisons) {
  const grouped = new Map();

  for (const comp of comparisons) {
    if (!grouped.has(comp.name)) {
      grouped.set(comp.name, {
        name: comp.name,
        comparisons: [],
        browsers: new Set(),
        viewports: new Set(),
        totalVariants: 0,
      });
    }

    const group = grouped.get(comp.name);
    group.comparisons.push(comp);
    group.totalVariants++;

    // Track unique browsers and viewports
    if (comp.properties?.browser) {
      group.browsers.add(comp.properties.browser);
    }
    if (comp.properties?.viewport_width && comp.properties?.viewport_height) {
      group.viewports.add(
        `${comp.properties.viewport_width}x${comp.properties.viewport_height}`
      );
    }
  }

  // Convert to array and sort by variant count (multi-variant first)
  return Array.from(grouped.values())
    .map(group => ({
      ...group,
      browsers: Array.from(group.browsers),
      viewports: Array.from(group.viewports),
      // Sort comparisons within group by viewport area (largest first)
      comparisons: group.comparisons.sort((a, b) => {
        const aArea =
          (a.properties?.viewport_width || 0) *
          (a.properties?.viewport_height || 0);
        const bArea =
          (b.properties?.viewport_width || 0) *
          (b.properties?.viewport_height || 0);
        return bArea - aArea;
      }),
    }))
    .sort((a, b) => {
      // Multi-variant groups first, then alphabetical
      if (a.totalVariants > 1 && b.totalVariants === 1) return -1;
      if (a.totalVariants === 1 && b.totalVariants > 1) return 1;
      return a.name.localeCompare(b.name);
    });
}

export default function ComparisonList({
  comparisons,
  onAccept,
  onReject,
  loadingStates,
}) {
  // Build groups from filtered comparisons
  // This ensures filtering works correctly - we filter first, then group
  const displayGroups = useMemo(() => {
    if (!comparisons || comparisons.length === 0) {
      return [];
    }
    return groupComparisons(comparisons);
  }, [comparisons]);

  if (!displayGroups || displayGroups.length === 0) {
    return <NoResults />;
  }

  return (
    <div className="space-y-6">
      {displayGroups.map(group => (
        <ComparisonGroup
          key={group.name}
          group={group}
          onAccept={onAccept}
          onReject={onReject}
          loadingStates={loadingStates}
        />
      ))}
    </div>
  );
}
