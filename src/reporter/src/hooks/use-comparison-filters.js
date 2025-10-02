import { useState, useMemo, useEffect } from 'react';
import { FILTER_TYPES, SORT_TYPES } from '../utils/constants.js';
import {
  filterComparisons,
  sortComparisons,
} from '../utils/comparison-helpers.js';

// Read URL params
let getInitialState = () => {
  let params = new URLSearchParams(window.location.search);
  return {
    filter: params.get('filter') || FILTER_TYPES.ALL,
    sortBy: params.get('sort') || SORT_TYPES.PRIORITY,
    searchQuery: params.get('search') || '',
    selectedBrowser: params.get('browser') || 'all',
    selectedViewport: params.get('viewport') || 'all',
  };
};

export default function useComparisonFilters(comparisons = []) {
  let initial = getInitialState();
  let [filter, setFilter] = useState(initial.filter);
  let [sortBy, setSortBy] = useState(initial.sortBy);
  let [searchQuery, setSearchQuery] = useState(initial.searchQuery);
  let [selectedBrowser, setSelectedBrowser] = useState(initial.selectedBrowser);
  let [selectedViewport, setSelectedViewport] = useState(
    initial.selectedViewport
  );

  // Update URL when filters change
  useEffect(() => {
    let params = new URLSearchParams();
    if (filter !== FILTER_TYPES.ALL) params.set('filter', filter);
    if (sortBy !== SORT_TYPES.PRIORITY) params.set('sort', sortBy);
    if (searchQuery) params.set('search', searchQuery);
    if (selectedBrowser !== 'all') params.set('browser', selectedBrowser);
    if (selectedViewport !== 'all') params.set('viewport', selectedViewport);

    let newUrl = params.toString()
      ? `?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [filter, sortBy, searchQuery, selectedBrowser, selectedViewport]);

  // Extract unique browsers and viewports from comparisons
  let availableFilters = useMemo(() => {
    let browsers = new Set();
    let viewports = new Set();

    comparisons.forEach(c => {
      if (c.properties?.browser) {
        browsers.add(c.properties.browser);
      }
      if (c.properties?.viewport) {
        let viewport = `${c.properties.viewport.width}x${c.properties.viewport.height}`;
        viewports.add(viewport);
      }
    });

    return {
      browsers: Array.from(browsers).sort(),
      viewports: Array.from(viewports).sort(),
    };
  }, [comparisons]);

  let filteredAndSorted = useMemo(() => {
    let filtered = filterComparisons(comparisons, filter);

    // Apply search filter
    if (searchQuery.trim()) {
      let query = searchQuery.toLowerCase();
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
        if (!c.properties?.viewport) return false;
        let viewport = `${c.properties.viewport.width}x${c.properties.viewport.height}`;
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
      new: comparisons.filter(c => c.status === 'baseline-created').length,
    },
  };
}
