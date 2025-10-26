import { Route, Switch, useLocation } from 'wouter';
import useReportData from '../hooks/use-report-data.js';
import DashboardHeader from './dashboard/dashboard-header.jsx';
import StatsView from './views/stats-view.jsx';
import ComparisonsView from './views/comparisons-view.jsx';
import SettingsView from './views/settings-view.jsx';
import ProjectsView from './views/projects-view.jsx';
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
  let currentView =
    location === '/stats'
      ? 'stats'
      : location === '/settings'
        ? 'settings'
        : location === '/projects'
          ? 'projects'
          : 'comparisons';

  let navigateTo = view => {
    if (view === 'stats') setLocation('/stats');
    else if (view === 'settings') setLocation('/settings');
    else if (view === 'projects') setLocation('/projects');
    else setLocation('/');
  };

  // Settings and Projects don't need screenshot data - always allow access
  let isManagementRoute = location === '/settings' || location === '/projects';

  // Loading state (but not for management routes)
  if (loading && !reportData && !isManagementRoute) {
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

  // Error state (but not for management routes)
  if (error && !reportData && !isManagementRoute) {
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

  // Waiting for screenshots state (but not for management routes)
  if (!reportData && !isManagementRoute) {
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
          {reportData ? (
            <StatsView
              reportData={reportData}
              setReportData={setReportData}
              onRefresh={refetch}
              loading={loading}
            />
          ) : (
            <WaitingForScreenshots />
          )}
        </Route>
        <Route path="/settings">
          <SettingsView />
        </Route>
        <Route path="/projects">
          <ProjectsView />
        </Route>
        <Route path="/">
          {reportData ? (
            <ComparisonsView
              reportData={reportData}
              setReportData={setReportData}
              onRefresh={refetch}
              loading={loading}
            />
          ) : (
            <WaitingForScreenshots />
          )}
        </Route>
      </Switch>
    </div>
  );
}
