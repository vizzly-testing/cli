import Card from '../components/card';
import Button from '../components/button';
import Alert from '../components/alert';
import DataTable from '../components/data-table';

const users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', status: 'Active' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'Editor', status: 'Active' },
  { id: 3, name: 'Carol White', email: 'carol@example.com', role: 'Viewer', status: 'Inactive' },
  { id: 4, name: 'David Brown', email: 'david@example.com', role: 'Editor', status: 'Active' },
];

const columns = [
  { key: 'id', label: 'ID', align: 'center' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status', align: 'center' },
];

<template>
  <div class="page-index" data-test-page="index">
    <header class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Welcome to the Vizzly visual testing demo application</p>
    </header>

    <div class="alerts-section" data-test-alerts>
      <Alert @variant="info" @title="Visual Testing">
        This app demonstrates the @vizzly-testing/ember SDK for visual regression testing.
      </Alert>
    </div>

    <div class="stats-grid">
      <Card @elevated={{true}} @testId="stat-users">
        <div class="stat">
          <span class="stat-value">1,234</span>
          <span class="stat-label">Total Users</span>
        </div>
      </Card>

      <Card @elevated={{true}} @testId="stat-tests">
        <div class="stat">
          <span class="stat-value">56</span>
          <span class="stat-label">Visual Tests</span>
        </div>
      </Card>

      <Card @elevated={{true}} @testId="stat-passed">
        <div class="stat">
          <span class="stat-value">98%</span>
          <span class="stat-label">Pass Rate</span>
        </div>
      </Card>

      <Card @elevated={{true}} @testId="stat-changes">
        <div class="stat">
          <span class="stat-value">3</span>
          <span class="stat-label">Pending Reviews</span>
        </div>
      </Card>
    </div>

    <Card @title="Recent Users" @testId="users-table">
      <:actions>
        <Button @variant="ghost" @size="small">View All</Button>
      </:actions>

      <:default>
        <DataTable @columns={{columns}} @rows={{users}} @testId="users" />
      </:default>
    </Card>
  </div>

  <style>
    .page-index {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 700;
      color: #111827;
    }

    .page-subtitle {
      margin: 0;
      font-size: 16px;
      color: #6b7280;
    }

    .alerts-section {
      margin-bottom: 24px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: #111827;
    }

    .stat-label {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }
  </style>
</template>
