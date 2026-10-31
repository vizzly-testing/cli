/**
 * Convert absolute file paths to web-accessible URLs
 */
export let convertPathToUrl = (filePath, vizzlyDir) => {
  if (!filePath) return null;
  // Convert absolute path to relative path from .vizzly directory
  if (filePath.startsWith(vizzlyDir)) {
    let relativePath = filePath.substring(vizzlyDir.length + 1);
    return `/images/${relativePath}`;
  }
  return filePath;
};

/**
 * Group comparisons by screenshot name with variant structure
 * Matches cloud product's grouping logic from comparison.js
 */
export let groupComparisons = comparisons => {
  let groups = new Map();

  // Group by screenshot name
  for (let comp of comparisons) {
    if (!groups.has(comp.name)) {
      groups.set(comp.name, {
        name: comp.name,
        comparisons: [],
        browsers: new Set(),
        viewports: new Set(),
        devices: new Set(),
        totalVariants: 0,
      });
    }

    let group = groups.get(comp.name);
    group.comparisons.push(comp);
    group.totalVariants++;

    // Track unique browsers, viewports, devices
    if (comp.properties?.browser) {
      group.browsers.add(comp.properties.browser);
    }
    if (comp.properties?.viewport_width && comp.properties?.viewport_height) {
      group.viewports.add(
        `${comp.properties.viewport_width}x${comp.properties.viewport_height}`
      );
    }
    if (comp.properties?.device) {
      group.devices.add(comp.properties.device);
    }
  }

  // Convert to final structure
  return Array.from(groups.values())
    .map(group => {
      let browsers = Array.from(group.browsers);
      let viewports = Array.from(group.viewports);
      let devices = Array.from(group.devices);

      // Build variants structure (browser -> viewport -> comparisons)
      let variants = {};
      group.comparisons.forEach(comp => {
        let browser = comp.properties?.browser || null;
        let viewport =
          comp.properties?.viewport_width && comp.properties?.viewport_height
            ? `${comp.properties.viewport_width}x${comp.properties.viewport_height}`
            : null;

        if (!variants[browser]) variants[browser] = {};
        if (!variants[browser][viewport]) variants[browser][viewport] = [];
        variants[browser][viewport].push(comp);
      });

      // Determine grouping strategy
      let groupingStrategy = 'flat';
      if (browsers.length > 1) groupingStrategy = 'browser';
      else if (viewports.length > 1) groupingStrategy = 'viewport';

      // Sort comparisons by viewport area (largest first)
      group.comparisons.sort((a, b) => {
        let aArea =
          (a.properties?.viewport_width || 0) *
          (a.properties?.viewport_height || 0);
        let bArea =
          (b.properties?.viewport_width || 0) *
          (b.properties?.viewport_height || 0);
        if (bArea !== aArea) return bArea - aArea;
        return (
          (b.properties?.viewport_width || 0) -
          (a.properties?.viewport_width || 0)
        );
      });

      return {
        ...group,
        browsers,
        viewports,
        devices: Array.from(devices),
        variants,
        groupingStrategy,
      };
    })
    .sort((a, b) => {
      // Sort groups: multi-variant first (by variant count), then singles alphabetically
      if (a.totalVariants > 1 && b.totalVariants === 1) return -1;
      if (a.totalVariants === 1 && b.totalVariants > 1) return 1;
      if (a.totalVariants > 1 && b.totalVariants > 1) {
        return b.totalVariants - a.totalVariants;
      }
      return a.name.localeCompare(b.name);
    });
};
