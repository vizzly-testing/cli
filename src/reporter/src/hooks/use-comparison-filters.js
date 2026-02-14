import { useEffect, useMemo, useState } from 'react';
import {
  filterComparisons,
  sortComparisons,
} from '../utils/comparison-helpers.js';
import { FILTER_TYPES, SORT_TYPES } from '../utils/constants.js';
import { isNewComparisonStatus } from '../utils/status-utils.js';

// Read URL params
const getInitialState = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    filter: params.get('filter') || FILTER_TYPES.ALL,
    sortBy: params.get('sort') || SORT_TYPES.PRIORITY,
    searchQuery: params.get('search') || '',
    selectedBrowser: params.get('browser') || 'all',
    selectedViewport: params.get('viewport') || 'all',
  };
};

export default function useComparisonFilters(comparisons = []) {
  const initial = getInitialState();
  const [filter, setFilter] = useState(initial.filter);
  const [sortBy, setSortBy] = useState(initial.sortBy);
  const [searchQuery, setSearchQuery] = useState(initial.searchQuery);
  const [selectedBrowser, setSelectedBrowser] = useState(
    initial.selectedBrowser
  );
  const [selectedViewport, setSelectedViewport] = useState(
    initial.selectedViewport
  );

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== FILTER_TYPES.ALL) params.set('filter', filter);
    if (sortBy !== SORT_TYPES.PRIORITY) params.set('sort', sortBy);
    if (searchQuery) params.set('search', searchQuery);
    if (selectedBrowser !== 'all') params.set('browser', selectedBrowser);
    if (selectedViewport !== 'all') params.set('viewport', selectedViewport);

    const newUrl = params.toString()
      ? `?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filter, sortBy, searchQuery, selectedBrowser, selectedViewport]);

  // Extract unique browsers and viewports from comparisons
  const availableFilters = useMemo(() => {
    const browsers = new Set();
    const viewports = new Set();

    comparisons.forEach(c => {
      if (c.properties?.browser) {
        browsers.add(c.properties.browser);
      }
      // Support both nested viewport and top-level viewport_width/viewport_height
      if (c.properties?.viewport_width && c.properties?.viewport_height) {
        const viewport = `${c.properties.viewport_width}x${c.properties.viewport_height}`;
        viewports.add(viewport);
      } else if (c.properties?.viewport) {
        const viewport = `${c.properties.viewport.width}x${c.properties.viewport.height}`;
        viewports.add(viewport);
      }
    });

    return {
      browsers: Array.from(browsers).sort(),
      viewports: Array.from(viewports).sort(),
    };
  }, [comparisons]);

  const filteredAndSorted = useMemo(() => {
    let filtered = filterComparisons(comparisons, filter);

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.name.toLowerCase().includes(query) ||
          c.originalName?.toLowerCase().includes(query)
      );
    }

    // Apply browser filter
    if (selectedBrowser !== 'all') {
      filtered = filtered.filter(
        c => c.properties?.browser === selectedBrowser
      );
    }

    // Apply viewport filter
    if (selectedViewport !== 'all') {
      filtered = filtered.filter(c => {
        let viewport = null;
        // Support both top-level viewport_width/viewport_height and nested viewport
        if (c.properties?.viewport_width && c.properties?.viewport_height) {
          viewport = `${c.properties.viewport_width}x${c.properties.viewport_height}`;
        } else if (c.properties?.viewport) {
          viewport = `${c.properties.viewport.width}x${c.properties.viewport.height}`;
        }
        return viewport === selectedViewport;
      });
    }

    return sortComparisons(filtered, sortBy);
  }, [
    comparisons,
    filter,
    sortBy,
    searchQuery,
    selectedBrowser,
    selectedViewport,
  ]);

  return {
    filteredComparisons: filteredAndSorted,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    selectedBrowser,
    setSelectedBrowser,
    selectedViewport,
    setSelectedViewport,
    availableFilters,
    counts: {
      all: comparisons.length,
      failed: comparisons.filter(c => c.status === 'failed').length,
      passed: comparisons.filter(c => c.status === 'passed').length,
      new: comparisons.filter(c => isNewComparisonStatus(c.status)).length,
      rejected: comparisons.filter(c => c.status === 'rejected').length,
    },
  };
}
