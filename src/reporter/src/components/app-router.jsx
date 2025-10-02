import { useState, useEffect } from 'react';
import useReportData from '../hooks/use-report-data.js';
import DashboardHeader from './dashboard/dashboard-header.jsx';
import StatsView from './views/stats-view.jsx';
import ComparisonsView from './views/comparisons-view.jsx';
import {
  LoadingState,
  ErrorState,
  WaitingForScreenshots,
} from './dashboard/empty-state.jsx';

export default function AppRouter({ initialData }) {
  let [currentView, setCurrentView] = useState('comparisons'); // 'comparisons' or 'stats'
  let { reportData, setReportData, loading, error, refetch } =
    useReportData(initialData);

  // Listen to URL hash changes for simple routing
  useEffect(() => {
    let handleHashChange = () => {
      let hash = window.location.hash.slice(1); // Remove #
      if (hash === 'stats') {
        setCurrentView('stats');
      } else {
        setCurrentView('comparisons');
      }
    };

    // Set initial view based on hash
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  let navigateTo = view => {
    window.location.hash = view === 'stats' ? '#stats' : '';
  };

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
        loading={loading}
        onNavigate={navigateTo}
        currentView={currentView}
      />

      {currentView === 'stats' ? (
        <StatsView
          reportData={reportData}
          onRefresh={refetch}
          loading={loading}
        />
      ) : (
        <ComparisonsView
          reportData={reportData}
          setReportData={setReportData}
          onRefresh={refetch}
          loading={loading}
        />
      )}
    </div>
  );
}
