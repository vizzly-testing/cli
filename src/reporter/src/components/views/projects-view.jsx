import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../ui/toast.jsx';
import {
  useAuthStatus,
  useInitiateLogin,
  usePollAuthorization,
  useLogout,
} from '../../hooks/queries/use-auth-queries.js';
import {
  useProjectMappings,
  useDeleteProjectMapping,
} from '../../hooks/queries/use-cloud-queries.js';
import { queryKeys } from '../../lib/query-keys.js';
import {
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  FolderIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Badge,
  Alert,
  EmptyState,
  Skeleton,
  SkeletonCard,
  Spinner,
} from '../design-system/index.js';

function DeviceFlowLogin({ onComplete }) {
  let [deviceFlow, setDeviceFlow] = useState(null);
  let [error, setError] = useState(null);

  let initiateLoginMutation = useInitiateLogin();
  let pollMutation = usePollAuthorization();
  let { addToast } = useToast();

  useEffect(() => {
    async function startDeviceFlow() {
      try {
        let flow = await initiateLoginMutation.mutateAsync();
        setDeviceFlow(flow);
      } catch (err) {
        setError(err.message);
        addToast(`Failed to start login: ${err.message}`, 'error');
      }
    }

    startDeviceFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAuthorization() {
    if (!deviceFlow?.deviceCode) return;

    setError(null);

    try {
      let result = await pollMutation.mutateAsync(deviceFlow.deviceCode);

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
    }
  }

  if (error) {
    return (
      <Alert variant="danger" title="Login Error">
        {error}
      </Alert>
    );
  }

  if (!deviceFlow) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Spinner size="lg" className="text-amber-400 mb-4" />
        <p className="text-slate-400">Starting login flow...</p>
      </div>
    );
  }

  return (
    <Card hover={false}>
      <CardBody className="text-center py-8">
        <h3 className="text-xl font-semibold text-white mb-6">
          Sign in to Vizzly
        </h3>

        <div className="bg-slate-900/50 rounded-xl p-6 mb-6 border border-slate-700/50 max-w-sm mx-auto">
          <p className="text-sm text-slate-400 mb-4">
            Click below to authorize:
          </p>
          <a
            href={
              deviceFlow.verificationUriComplete || deviceFlow.verificationUri
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-medium rounded-lg transition-colors mb-4"
          >
            Open Authorization Page
          </a>
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 mb-2">
              Or enter this code manually:
            </p>
            <div className="text-2xl font-mono font-bold text-amber-400 tracking-wider">
              {deviceFlow.userCode}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          After authorizing in your browser, click the button below to complete
          sign in.
        </p>

        <Button
          variant="secondary"
          onClick={checkAuthorization}
          loading={pollMutation.isPending}
        >
          Check Status
        </Button>
      </CardBody>
    </Card>
  );
}

function AuthCard() {
  let [showingLogin, setShowingLogin] = useState(false);
  let queryClient = useQueryClient();
  let { data: authData, isLoading } = useAuthStatus();
  let logoutMutation = useLogout();
  let { addToast } = useToast();

  let user = authData?.user;
  let authenticated = authData?.authenticated;

  let handleLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
      addToast('Logged out successfully', 'success');
    } catch (err) {
      addToast(`Logout failed: ${err.message}`, 'error');
    }
  }, [logoutMutation, addToast]);

  let handleLoginComplete = useCallback(() => {
    setShowingLogin(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.auth });
  }, [queryClient]);

  if (isLoading) {
    return <SkeletonCard />;
  }

  if (showingLogin) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowingLogin(false)}
        >
          &larr; Back
        </Button>
        <DeviceFlowLogin onComplete={handleLoginComplete} />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Card hover={false}>
        <CardBody className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
            <UserCircleIcon className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Not signed in
          </h3>
          <p className="text-slate-400 mb-6 max-w-sm mx-auto">
            Sign in to access projects and team features
          </p>
          <Button
            variant="primary"
            onClick={() => setShowingLogin(true)}
            icon={ArrowRightOnRectangleIcon}
          >
            Sign In
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card hover={false}>
      <CardBody>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center">
              <UserCircleIcon className="w-7 h-7 text-slate-900" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {user?.name || 'User'}
              </h3>
              <p className="text-sm text-slate-400">{user?.email}</p>
              {user?.organizationName && (
                <Badge variant="default" className="mt-2">
                  {user.organizationName}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            loading={logoutMutation.isPending}
            icon={ArrowLeftOnRectangleIcon}
          >
            Sign Out
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ProjectMappingsTable({ mappings, onDelete, deleting }) {
  let { addToast, confirm } = useToast();

  let handleDelete = useCallback(
    async directory => {
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
    },
    [onDelete, addToast, confirm]
  );

  if (mappings.length === 0) {
    return (
      <EmptyState
        icon={FolderIcon}
        title="No project mappings"
        description="Link a directory to a Vizzly project using the CLI."
        action={
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4 max-w-md mx-auto">
            <code className="text-sm text-amber-400 font-mono">
              vizzly project:select
            </code>
          </div>
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="vz-table">
        <thead>
          <tr>
            <th>Directory</th>
            <th>Project</th>
            <th>Organization</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((mapping, idx) => (
            <tr key={idx}>
              <td className="font-mono text-sm">{mapping.directory}</td>
              <td className="text-white">
                {mapping.projectName || mapping.projectSlug}
              </td>
              <td>{mapping.organizationSlug}</td>
              <td className="text-right">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(mapping.directory)}
                  disabled={deleting}
                  icon={TrashIcon}
                  className="!p-2"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProjectsView() {
  let {
    data: mappingsData,
    isLoading: mappingsLoading,
    refetch,
  } = useProjectMappings();
  let deleteMappingMutation = useDeleteProjectMapping();

  let mappings = mappingsData?.mappings || [];

  let handleDeleteMapping = useCallback(
    async directory => {
      await deleteMappingMutation.mutateAsync(directory);
    },
    [deleteMappingMutation]
  );

  if (mappingsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton variant="heading" className="w-32 mb-2" />
          <Skeleton variant="text" className="w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SkeletonCard />
          </div>
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <p className="text-slate-400 mt-1">
          Manage your Vizzly account and directory mappings
        </p>
      </div>

      {/* Auth + Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AuthCard />
        </div>
        <Card hover={false}>
          <CardHeader title="Quick Stats" />
          <CardBody>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Project Mappings</span>
              <span className="text-2xl font-semibold font-mono text-white">
                {mappings.length}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Project Mappings */}
      <Card hover={false}>
        <CardHeader
          icon={FolderIcon}
          title="Project Mappings"
          iconColor="bg-amber-500/10 text-amber-400"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              icon={ArrowPathIcon}
            >
              Refresh
            </Button>
          }
        />
        <CardBody padding="p-0">
          <ProjectMappingsTable
            mappings={mappings}
            onDelete={handleDeleteMapping}
            deleting={deleteMappingMutation.isPending}
          />
        </CardBody>
      </Card>
    </div>
  );
}
