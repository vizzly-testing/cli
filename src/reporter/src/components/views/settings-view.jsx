import {
  CheckCircleIcon,
  Cog6ToothIcon,
  ServerIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { useCallback, useState } from 'react';
import {
  useConfig,
  useUpdateProjectConfig,
} from '../../hooks/queries/use-config-queries.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  Skeleton,
  SkeletonCard,
  Tabs,
  Toggle,
} from '../design-system/index.js';
import { useToast } from '../ui/toast.jsx';

function getInitialFormData(config) {
  return {
    threshold: config?.comparison?.threshold ?? 2.0,
    port: config?.server?.port ?? 47392,
    timeout: config?.server?.timeout ?? 30000,
    buildName: config?.build?.name ?? 'Build {timestamp}',
    environment: config?.build?.environment ?? 'test',
    openReport: config?.tdd?.openReport ?? false,
  };
}

function SourceBadge({ source }) {
  const variants = {
    default: 'default',
    project: 'info',
    global: 'purple',
    env: 'success',
    cli: 'warning',
  };

  const labels = {
    default: 'Default',
    project: 'Project',
    global: 'Global',
    env: 'Environment',
    cli: 'CLI Flag',
  };

  return (
    <Badge variant={variants[source] || 'default'} size="sm">
      {labels[source] || source}
    </Badge>
  );
}

function SettingsForm({ config, sources, onSave, isSaving }) {
  const initialFormData = getInitialFormData(config);
  const [formData, setFormData] = useState(initialFormData);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const handleFieldChange = useCallback((name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setHasChanges(true);
  }, []);

  const handleReset = useCallback(() => {
    setFormData(getInitialFormData(config));
    setHasChanges(false);
  }, [config]);

  const handleSave = useCallback(() => {
    const updates = {
      comparison: {
        threshold: formData.threshold,
      },
      server: {
        port: formData.port,
        timeout: formData.timeout,
      },
      build: {
        name: formData.buildName,
        environment: formData.environment,
      },
      tdd: {
        openReport: formData.openReport,
      },
    };
    onSave(updates, () => setHasChanges(false));
  }, [formData, onSave]);

  const tabs = [
    { key: 'general', label: 'General', icon: Cog6ToothIcon },
    { key: 'server', label: 'Server', icon: ServerIcon },
    { key: 'build', label: 'Build', icon: WrenchScrewdriverIcon },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
        variant="default"
      />

      {/* Tab Content */}
      {activeTab === 'general' && (
        <Card hover={false}>
          <CardHeader
            icon={Cog6ToothIcon}
            title="General Settings"
            description="Configure visual comparison and TDD behavior"
            iconColor="bg-amber-500/10 text-amber-400"
          />
          <CardBody className="space-y-6">
            <Input
              label="Visual Comparison Threshold"
              type="number"
              value={formData.threshold}
              onChange={e =>
                handleFieldChange('threshold', parseFloat(e.target.value))
              }
              hint="Percentage of pixel difference allowed before marking as failed (0.0 - 1.0)"
              step="0.01"
              min="0"
              max="1"
            />

            <Toggle
              label="Auto-open Report"
              description="Automatically open the dashboard in your browser when starting TDD mode"
              checked={formData.openReport}
              onChange={e => handleFieldChange('openReport', e.target.checked)}
            />

            <div className="pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <span className="text-sm text-slate-500">Config source:</span>
              <SourceBadge source={sources?.comparison || 'default'} />
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'server' && (
        <Card hover={false}>
          <CardHeader
            icon={ServerIcon}
            title="Server Settings"
            description="Local screenshot server configuration"
            iconColor="bg-blue-500/10 text-blue-400"
          />
          <CardBody className="space-y-6">
            <Input
              label="Server Port"
              type="number"
              value={formData.port}
              onChange={e =>
                handleFieldChange('port', parseInt(e.target.value, 10))
              }
              hint="Port for the local screenshot server"
            />

            <Input
              label="Server Timeout"
              type="number"
              value={formData.timeout}
              onChange={e =>
                handleFieldChange('timeout', parseInt(e.target.value, 10))
              }
              hint="Request timeout in milliseconds"
            />

            <div className="pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <span className="text-sm text-slate-500">Config source:</span>
              <SourceBadge source={sources?.server || 'default'} />
            </div>
          </CardBody>
        </Card>
      )}

      {activeTab === 'build' && (
        <Card hover={false}>
          <CardHeader
            icon={WrenchScrewdriverIcon}
            title="Build Settings"
            description="Configure build naming and environment"
            iconColor="bg-purple-500/10 text-purple-400"
          />
          <CardBody className="space-y-6">
            <Input
              label="Build Name Template"
              type="text"
              value={formData.buildName}
              onChange={e => handleFieldChange('buildName', e.target.value)}
              hint="Template for build names (use {timestamp} for current time)"
            />

            <Select
              label="Environment"
              value={formData.environment}
              onChange={e => handleFieldChange('environment', e.target.value)}
              hint="Target environment for builds"
              options={[
                { value: 'test', label: 'Test' },
                { value: 'development', label: 'Development' },
                { value: 'staging', label: 'Staging' },
                { value: 'production', label: 'Production' },
              ]}
            />

            <div className="pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <span className="text-sm text-slate-500">Config source:</span>
              <SourceBadge source={sources?.build || 'default'} />
            </div>
          </CardBody>
        </Card>
      )}

      {/* Floating Save Bar */}
      {hasChanges && (
        <div className="fixed bottom-6 right-6 left-6 md:left-auto md:w-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-4 flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden md:inline">
              Unsaved changes
            </span>
            <div className="flex gap-3 flex-1 md:flex-initial">
              <Button
                variant="ghost"
                onClick={handleReset}
                disabled={isSaving}
                className="flex-1 md:flex-initial"
              >
                Reset
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={isSaving}
                icon={CheckCircleIcon}
                className="flex-1 md:flex-initial"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsView() {
  const { data: configData, isLoading, error, refetch } = useConfig();
  const updateMutation = useUpdateProjectConfig();
  const { addToast } = useToast();

  const handleSave = useCallback(
    (updates, onSuccess) => {
      updateMutation.mutate(updates, {
        onSuccess: () => {
          onSuccess();
          addToast('Settings saved successfully!', 'success');
        },
        onError: err => {
          addToast(`Failed to save settings: ${err.message}`, 'error');
        },
      });
    },
    [updateMutation, addToast]
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton variant="heading" className="w-32 mb-2" />
          <Skeleton variant="text" className="w-64" />
        </div>
        <Skeleton variant="text" className="w-96 h-10" />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 mt-1">
            Configure your Vizzly local development server
          </p>
        </div>
        <Alert
          variant="danger"
          title="Failed to load settings"
          dismissible
          onDismiss={() => refetch()}
        >
          {error.message}
          <Button
            variant="danger"
            size="sm"
            onClick={() => refetch()}
            className="mt-3"
          >
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">
          Configure your Vizzly local development server
        </p>
      </div>

      <SettingsForm
        key={JSON.stringify(configData?.config)}
        config={configData?.config}
        sources={configData?.sources}
        onSave={handleSave}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}
