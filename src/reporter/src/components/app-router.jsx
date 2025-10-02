import { useState, useCallback } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import useReportData from '../hooks/use-report-data.js';
import DashboardHeader from './dashboard/dashboard-header.jsx';
import StatsView from './views/stats-view.jsx';
import ComparisonsView from './views/comparisons-view.jsx';
import {
  LoadingState,
  ErrorState,
  WaitingForScreenshots,
} from './dashboard/empty-state.jsx';
import { acceptAllBaselines } from '../services/api-client.js';

export default function AppRouter({ initialData }) {
  let [location, setLocation] = useLocation();
  let { reportData, setReportData, loading, error, refetch } =
    useReportData(initialData);
  let [acceptingAll, setAcceptingAll] = useState(false);

  // Determine current view based on route
  let currentView = location === '/stats' ? 'stats' : 'comparisons';

  let navigateTo = view => {
    setLocation(view === 'stats' ? '/stats' : '/');
  };

  let handleAcceptAll = useCallback(async () => {
    if (
      !window.confirm(
        'Accept all changes as new baselines? This will update all failed and new screenshots.'
      )
    ) {
      return;
    }

    setAcceptingAll(true);
    try {
      let result = await acceptAllBaselines();

      // Update all failed/new comparisons to passed
      setReportData(prevData => ({
        ...prevData,
        comparisons: prevData.comparisons.map(c =>
          c.status === 'failed' || c.status === 'new'
            ? { ...c, status: 'passed', diffPercentage: 0, diff: null }
            : c
        ),
      }));

      window.alert(`Successfully accepted ${result.count} baselines!`);
    } catch (err) {
      console.error('Failed to accept all baselines:', err);
      window.alert('Failed to accept all baselines. Please try again.');
    } finally {
      setAcceptingAll(false);
    }
  }, [setReportData]);

  // Check if there are any changes to accept
  let hasChanges =
    reportData?.comparisons?.some(
      c => c.status === 'failed' || c.status === 'new'
    ) || false;

  // Loading state
  if (loading && !reportData) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <DashboardHeader
          loading={loading}
          onNavigate={navigateTo}
          currentView={currentView}
        />
        <LoadingState />
      </div>
    );
  }

  // Error state
  if (error && !reportData) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <DashboardHeader
          loading={loading}
          onNavigate={navigateTo}
          currentView={currentView}
        />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  // Waiting for screenshots state
  if (!reportData) {
    return <WaitingForScreenshots />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <DashboardHeader
        loading={loading || acceptingAll}
        onNavigate={navigateTo}
        currentView={currentView}
        onAcceptAll={handleAcceptAll}
        hasChanges={hasChanges}
      />

      <Switch>
        <Route path="/stats">
          <StatsView
            reportData={reportData}
            setReportData={setReportData}
            onRefresh={refetch}
            loading={loading}
          />
        </Route>
        <Route path="/">
          <ComparisonsView
            reportData={reportData}
            setReportData={setReportData}
            onRefresh={refetch}
            loading={loading}
          />
        </Route>
      </Switch>
    </div>
  );
}
