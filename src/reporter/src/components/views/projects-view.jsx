import { useState, useCallback, useEffect } from 'react';
import { useToast } from '../ui/toast.jsx';
import useAuth from '../../hooks/use-auth.js';
import useProjects from '../../hooks/use-projects.js';
import {
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  FolderIcon,
  TrashIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

function DeviceFlowLogin({ onComplete }) {
  let [deviceFlow, setDeviceFlow] = useState(null);
  let [checking, setChecking] = useState(false);
  let [error, setError] = useState(null);

  let { initiateLogin, pollAuthorization } = useAuth();
  let { addToast } = useToast();

  useEffect(() => {
    async function startDeviceFlow() {
      try {
        let flow = await initiateLogin();
        setDeviceFlow(flow);
      } catch (err) {
        setError(err.message);
        addToast(`Failed to start login: ${err.message}`, 'error');
      }
    }

    startDeviceFlow();
  }, [initiateLogin, addToast]);

  async function checkAuthorization() {
    if (!deviceFlow?.deviceCode) return;

    setChecking(true);
    setError(null);

    try {
      let result = await pollAuthorization(deviceFlow.deviceCode);

      if (result.status === 'complete') {
        addToast('Login successful!', 'success');
        onComplete?.();
      } else if (result.status === 'pending') {
        addToast('Still waiting for authorization...', 'info');
      } else {
        setError('Unexpected response from server');
      }
    } catch (err) {
      setError(err.message);
      addToast(`Check failed: ${err.message}`, 'error');
    } finally {
      setChecking(false);
    }
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 text-center">
        <XCircleIcon className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!deviceFlow) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 mt-4">Starting login flow...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-8 text-center">
      <h3 className="text-2xl font-semibold text-white mb-6">Sign in to Vizzly</h3>

      <div className="bg-slate-900/80 backdrop-blur rounded-xl p-6 mb-6 border border-gray-700/50">
        <p className="text-sm text-gray-300 mb-4">Click below to authorize:</p>
        <a
          href={deviceFlow.verificationUriComplete || deviceFlow.verificationUri}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2 mb-4 shadow-lg shadow-amber-500/20"
        >
          Open Authorization Page
        </a>
        <div className="mt-4 pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-400 mb-2">Or enter this code manually:</p>
          <div className="text-2xl font-mono font-bold text-amber-500 tracking-wider">
            {deviceFlow.userCode}
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-300 mb-4">
        After authorizing in your browser, click the button below to complete sign in.
      </p>

      <button
        onClick={checkAuthorization}
        disabled={checking}
        className="px-6 py-3 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed text-white rounded-lg transition-colors inline-flex items-center gap-2 border border-gray-700"
      >
        {checking ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Checking...
          </>
        ) : (
          'Check Status'
        )}
      </button>
    </div>
  );
}

function AuthCard() {
  let [showingLogin, setShowingLogin] = useState(false);
  let { user, authenticated, loading, logout, refetch } = useAuth();
  let { addToast } = useToast();

  let handleLogout = useCallback(async () => {
    try {
      await logout();
      addToast('Logged out successfully', 'success');
    } catch (err) {
      addToast(`Logout failed: ${err.message}`, 'error');
    }
  }, [logout, addToast]);

  let handleLoginComplete = useCallback(() => {
    setShowingLogin(false);
    refetch();
  }, [refetch]);

  if (loading) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-slate-700 rounded w-32 mb-4"></div>
        <div className="h-4 bg-slate-700 rounded w-48"></div>
      </div>
    );
  }

  if (showingLogin) {
    return (
      <div>
        <button
          onClick={() => setShowingLogin(false)}
          className="text-sm text-gray-400 hover:text-gray-300 mb-4"
        >
          ← Back
        </button>
        <DeviceFlowLogin onComplete={handleLoginComplete} />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-8 text-center">
        <UserCircleIcon className="w-16 h-16 text-gray-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">Not signed in</h3>
        <p className="text-gray-300 mb-6">Sign in to access projects and team features</p>
        <button
          onClick={() => setShowingLogin(true)}
          className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2 shadow-lg shadow-amber-500/20"
        >
          <ArrowRightOnRectangleIcon className="w-5 h-5" />
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/20">
            <UserCircleIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{user?.name || 'User'}</h3>
            <p className="text-sm text-gray-300">{user?.email}</p>
            {user?.organizationName && (
              <p className="text-xs text-gray-400 mt-1">{user.organizationName}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors inline-flex items-center gap-2 border border-gray-700"
        >
          <ArrowLeftOnRectangleIcon className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function ProjectMappingsTable({ mappings, onDelete }) {
  let { addToast, confirm } = useToast();

  let handleDelete = useCallback(async (directory) => {
    let confirmed = await confirm(
      `Remove project mapping for ${directory}?`,
      'This will not delete any files, only the project association.'
    );

    if (!confirmed) return;

    try {
      await onDelete(directory);
      addToast('Mapping removed successfully', 'success');
    } catch (err) {
      addToast(`Failed to remove mapping: ${err.message}`, 'error');
    }
  }, [onDelete, addToast, confirm]);

  if (mappings.length === 0) {
    return (
      <div className="text-center py-8">
        <FolderIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
        <h3 className="text-lg font-medium text-white mb-2">No project mappings</h3>
        <p className="text-sm text-gray-300 mb-4 max-w-md mx-auto">
          Link a directory to a Vizzly project using the CLI from within your project directory.
        </p>
        <div className="bg-slate-900 border border-gray-700 rounded-lg p-4 max-w-md mx-auto">
          <code className="text-sm text-amber-500 font-mono">
            vizzly project:select
          </code>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Mappings you create will appear here for easy management.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Directory</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Project</th>
            <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Organization</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping, idx) => (
            <tr key={idx} className="border-b border-gray-700/50 hover:bg-white/5">
              <td className="py-3 px-4 text-sm text-gray-300 font-mono">{mapping.directory}</td>
              <td className="py-3 px-4 text-sm text-white">{mapping.projectName || mapping.projectSlug}</td>
              <td className="py-3 px-4 text-sm text-gray-400">{mapping.organizationSlug}</td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => handleDelete(mapping.directory)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  title="Remove mapping"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentBuildsCard({ builds }) {
  if (builds.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <ClockIcon className="w-12 h-12 mx-auto mb-4 text-gray-500" />
        <p>No recent builds</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {builds.slice(0, 5).map((build, idx) => (
        <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors border border-gray-700/50">
          <div className="flex-1">
            <h4 className="text-sm font-medium text-white">{build.name}</h4>
            <p className="text-xs text-gray-400 mt-1">
              {build.branch} • {new Date(build.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {build.status === 'passed' && (
              <span className="text-green-400 text-sm flex items-center gap-1">
                <CheckCircleIcon className="w-4 h-4" />
                Passed
              </span>
            )}
            {build.status === 'failed' && (
              <span className="text-red-400 text-sm flex items-center gap-1">
                <XCircleIcon className="w-4 h-4" />
                Failed
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectsView() {
  let { authenticated } = useAuth();
  let { mappings, recentBuilds, loading, deleteMapping, refetch } = useProjects();

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-700 rounded w-48"></div>
          <div className="h-64 bg-slate-700 rounded"></div>
          <div className="h-64 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
        <p className="text-gray-300">Manage your Vizzly projects and directory mappings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2">
          <AuthCard />
        </div>
        <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Stats</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-300">Project Mappings</span>
              <span className="text-white font-medium">{mappings.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Recent Builds</span>
              <span className="text-white font-medium">{recentBuilds.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Project Mappings</h2>
            <button
              onClick={refetch}
              className="text-sm text-amber-500 hover:text-amber-400 transition-colors font-medium"
            >
              Refresh
            </button>
          </div>
          <ProjectMappingsTable mappings={mappings} onDelete={deleteMapping} />
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Recent Builds</h2>
          <RecentBuildsCard builds={recentBuilds} />
        </div>
      </div>
    </div>
  );
}
