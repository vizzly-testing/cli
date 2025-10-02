export async function fetchReportData() {
  let response = await fetch('/api/report-data');
  if (!response.ok) {
    throw new Error('Failed to fetch report data');
  }
  let data = await response.json();
  return data;
}

export async function acceptBaseline(screenshotName) {
  let response = await fetch('/accept-baseline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: screenshotName }),
  });

  if (!response.ok) {
    throw new Error('Failed to accept baseline');
  }

  return response.json();
}
