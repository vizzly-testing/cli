/**
 * Check if we're in static mode (data embedded in HTML)
 */
export function isStaticMode() {
  return typeof window !== 'undefined' && window.VIZZLY_STATIC_MODE === true;
}

/**
 * Fetch report data from server or return embedded static data
 */
export async function fetchReportData() {
  // In static mode, return embedded data
  if (isStaticMode() && window.VIZZLY_REPORTER_DATA) {
    return window.VIZZLY_REPORTER_DATA;
  }

  // In live mode, fetch from server
  let response = await fetch('/api/report-data');
  if (!response.ok) {
    throw new Error('Failed to fetch report data');
  }
  let data = await response.json();
  return data;
}

export async function acceptBaseline(comparisonId) {
  if (isStaticMode()) {
    throw new Error(
      'Cannot accept baselines in static report mode. Use the live dev server.'
    );
  }

  let response = await fetch('/api/baseline/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: comparisonId }),
  });

  if (!response.ok) {
    throw new Error('Failed to accept baseline');
  }

  return response.json();
}

export async function acceptAllBaselines() {
  if (isStaticMode()) {
    throw new Error(
      'Cannot accept baselines in static report mode. Use the live dev server.'
    );
  }

  let response = await fetch('/api/baseline/accept-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to accept all baselines');
  }

  return response.json();
}

export async function resetBaselines() {
  if (isStaticMode()) {
    throw new Error(
      'Cannot reset baselines in static report mode. Use the live dev server.'
    );
  }

  let response = await fetch('/api/baseline/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to reset baselines');
  }

  return response.json();
}
