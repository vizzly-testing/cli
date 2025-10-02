import { useState } from 'react';

export default function useVizzlyAPI() {
  let [loading, setLoading] = useState(false);

  let acceptBaseline = async screenshotName => {
    setLoading(true);
    try {
      let response = await fetch('/accept-baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: screenshotName }),
      });

      if (!response.ok) {
        throw new Error('Failed to accept baseline');
      }

      let result = await response.json();
      return result;
    } finally {
      setLoading(false);
    }
  };

  let rejectBaseline = async screenshotName => {
    // For now, reject is just a UI action
    // Could be extended to call an API endpoint if needed
    return { name: screenshotName, action: 'rejected' };
  };

  let fetchReportData = async () => {
    let response = await fetch('/api/report-data');
    if (!response.ok) {
      throw new Error('Failed to fetch report data');
    }
    return response.json();
  };

  return {
    acceptBaseline,
    rejectBaseline,
    fetchReportData,
    loading,
  };
}
