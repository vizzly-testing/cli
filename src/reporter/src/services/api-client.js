export async function fetchReportData() {
  let response = await fetch('/api/report-data');
  if (!response.ok) {
    throw new Error('Failed to fetch report data');
  }
  let data = await response.json();
  return data;
}

export async function acceptBaseline(comparisonId) {
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
  let response = await fetch('/api/baseline/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Failed to reset baselines');
  }

  return response.json();
}
