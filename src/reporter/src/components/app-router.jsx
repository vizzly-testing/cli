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

export default function AppRouter({ initialData }) {
  let [location, setLocation] = useLocation();
  let { reportData, setReportData, loading, error, refetch } =
    useReportData(initialData);

  // Determine current view based on route
  let currentView = location === '/stats' ? 'stats' : 'comparisons';

  let navigateTo = view => {
    setLocation(view === 'stats' ? '/stats' : '/');
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
