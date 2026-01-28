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
  Input,
  Select,
  Skeleton,
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
  let variants = {
    default: 'default',
    project: 'info',
    global: 'purple',
    env: 'success',
    cli: 'warning',
  };

  let labels = {
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

function SettingSection({ title, source, description, children, noSource }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-white uppercase tracking-wide">
          {title}
        </h3>
        {!noSource && <SourceBadge source={source || 'default'} />}
      </div>
      {description && <p className="text-sm text-slate-400">{description}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}


function SettingsForm({ config, sources, onSave, isSaving }) {
  let initialFormData = getInitialFormData(config);
  let [formData, setFormData] = useState(initialFormData);
  let [hasChanges, setHasChanges] = useState(false);

  let handleFieldChange = useCallback((name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    setHasChanges(true);
  }, []);

  let handleReset = useCallback(() => {
    setFormData(getInitialFormData(config));
    setHasChanges(false);
  }, [config]);

  let handleSave = useCallback(() => {
    let updates = {
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Comparison Settings */}
        <Card hover={false}>
          <CardBody>
            <SettingSection
              title="Comparison"
              source={sources?.comparison}
              description="Configure how screenshots are compared"
            >
              <Input
                label="Threshold"
                type="number"
                value={formData.threshold}
                onChange={e =>
                  handleFieldChange('threshold', parseFloat(e.target.value))
                }
                hint="CIEDE2000 Delta E. 0 = exact, 2 = recommended"
                step="0.1"
                min="0"
              />
            </SettingSection>
          </CardBody>
        </Card>

        {/* Server Settings */}
        <Card hover={false}>
          <CardBody>
            <SettingSection
              title="Server"
              source={sources?.server}
              description="Local screenshot server configuration"
            >
              <Input
                label="Port"
                type="number"
                value={formData.port}
                onChange={e =>
                  handleFieldChange('port', parseInt(e.target.value, 10))
                }
                hint="Default: 47392"
              />
              <Input
                label="Timeout"
                type="number"
                value={formData.timeout}
                onChange={e =>
                  handleFieldChange('timeout', parseInt(e.target.value, 10))
                }
                hint="Request timeout in milliseconds"
              />
            </SettingSection>
          </CardBody>
        </Card>
      </div>

      {/* Right Column */}
      <div className="space-y-6">
        {/* Build Settings */}
        <Card hover={false}>
          <CardBody>
            <SettingSection
              title="Build"
              source={sources?.build}
              description="Build naming and environment"
            >
              <Input
                label="Name Template"
                type="text"
                value={formData.buildName}
                onChange={e => handleFieldChange('buildName', e.target.value)}
                hint="Use {timestamp} for current time"
              />
              <Select
                label="Environment"
                value={formData.environment}
                onChange={e => handleFieldChange('environment', e.target.value)}
                options={[
                  { value: 'test', label: 'Test' },
                  { value: 'development', label: 'Development' },
                  { value: 'staging', label: 'Staging' },
                  { value: 'production', label: 'Production' },
                ]}
              />
            </SettingSection>
          </CardBody>
        </Card>

        {/* TDD Settings */}
        <Card hover={false}>
          <CardBody>
            <SettingSection
              title="TDD Mode"
              source={sources?.tdd}
              description="Development workflow preferences"
            >
              <Toggle
                label="Auto-open Report"
                description="Open dashboard in browser when starting TDD mode"
                checked={formData.openReport}
                onChange={e =>
                  handleFieldChange('openReport', e.target.checked)
                }
              />
            </SettingSection>
          </CardBody>
        </Card>
      </div>

      {/* Full-width Actions */}
      <div className="lg:col-span-2">
        <Card hover={false}>
          <CardBody className="flex items-center justify-between">
            <div className="text-sm text-slate-400">
              {hasChanges ? (
                <span className="text-amber-400">You have unsaved changes</span>
              ) : (
                <span>Settings saved to project config</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                Reset
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={isSaving}
                disabled={!hasChanges}
              >
                Save Changes
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsView() {
  let { data: configData, isLoading, error, refetch } = useConfig();
  let updateMutation = useUpdateProjectConfig();
  let { addToast } = useToast();

  let handleSave = useCallback(
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card hover={false}>
              <CardBody className="space-y-4">
                <Skeleton variant="text" className="w-24" />
                <Skeleton variant="text" className="w-full h-10" />
              </CardBody>
            </Card>
            <Card hover={false}>
              <CardBody className="space-y-4">
                <Skeleton variant="text" className="w-20" />
                <Skeleton variant="text" className="w-full h-10" />
                <Skeleton variant="text" className="w-full h-10" />
              </CardBody>
            </Card>
          </div>
          <div className="space-y-6">
            <Card hover={false}>
              <CardBody className="space-y-4">
                <Skeleton variant="text" className="w-16" />
                <Skeleton variant="text" className="w-full h-10" />
                <Skeleton variant="text" className="w-full h-10" />
              </CardBody>
            </Card>
            <Card hover={false}>
              <CardBody className="space-y-4">
                <Skeleton variant="text" className="w-24" />
                <Skeleton variant="text" className="w-full h-10" />
              </CardBody>
            </Card>
          </div>
        </div>
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
    <div className="space-y-6">
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
