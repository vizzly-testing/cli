import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import DataTable from 'test-ember-app/components/data-table';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Integration | Component | DataTable', function (hooks) {
  setupRenderingTest(hooks);

  const columns = [
    { key: 'id', label: 'ID', align: 'center' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status', align: 'center' },
  ];

  const rows = [
    { id: 1, name: 'Alice Johnson', email: 'alice@example.com', status: 'Active' },
    { id: 2, name: 'Bob Smith', email: 'bob@example.com', status: 'Active' },
    { id: 3, name: 'Carol White', email: 'carol@example.com', status: 'Inactive' },
  ];

  test('it renders table with data', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 600px;">
        <DataTable @columns={{columns}} @rows={{rows}} @testId="users-table" />
      </div>
    </template>);

    assert.dom('[data-test-data-table="users-table"]').exists();
    assert.dom('.table-header').exists({ count: 4 });
    assert.dom('.table-row').exists({ count: 3 });

    await vizzlyScreenshot('data-table-with-data');
  });

  test('it renders empty state', async function (assert) {
    let emptyRows = [];

    await render(<template>
      <div style="padding: 20px; max-width: 600px;">
        <DataTable
          @columns={{columns}}
          @rows={{emptyRows}}
          @emptyMessage="No users found"
          @testId="empty-table"
        />
      </div>
    </template>);

    assert.dom('.table-empty').hasText('No users found');

    await vizzlyScreenshot('data-table-empty');
  });

  test('it renders with many rows', async function (assert) {
    let manyRows = [];
    for (let i = 1; i <= 10; i++) {
      manyRows.push({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        status: i % 3 === 0 ? 'Inactive' : 'Active',
      });
    }

    await render(<template>
      <div style="padding: 20px; max-width: 600px;">
        <DataTable @columns={{columns}} @rows={{manyRows}} @testId="many-rows" />
      </div>
    </template>);

    assert.dom('.table-row').exists({ count: 10 });

    await vizzlyScreenshot('data-table-many-rows');
  });

  test('it applies column alignment', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 600px;">
        <DataTable @columns={{columns}} @rows={{rows}} @testId="aligned-table" />
      </div>
    </template>);

    // ID and Status columns should be centered
    assert.dom('.table-header.center').exists({ count: 2 });
    assert.dom('.table-cell.center').exists({ count: 6 }); // 2 columns * 3 rows

    await vizzlyScreenshot('data-table-alignment');
  });
});
