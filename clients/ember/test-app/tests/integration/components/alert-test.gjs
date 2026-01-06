import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import Alert from 'test-ember-app/components/alert';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Integration | Component | Alert', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders all variants', async function (assert) {
    await render(<template>
      <div class="alert-variants" style="display: flex; flex-direction: column; gap: 16px; padding: 20px; max-width: 500px;">
        <Alert @variant="info" @title="Information" @testId="info">
          This is an informational message.
        </Alert>

        <Alert @variant="success" @title="Success" @testId="success">
          Operation completed successfully.
        </Alert>

        <Alert @variant="warning" @title="Warning" @testId="warning">
          Please review before continuing.
        </Alert>

        <Alert @variant="error" @title="Error" @testId="error">
          Something went wrong.
        </Alert>
      </div>
    </template>);

    assert.dom('[data-test-alert="info"]').exists();
    assert.dom('[data-test-alert="success"]').exists();
    assert.dom('[data-test-alert="warning"]').exists();
    assert.dom('[data-test-alert="error"]').exists();

    await vizzlyScreenshot('alert-variants');
  });

  test('it renders without title', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 500px;">
        <Alert @variant="info" @testId="no-title">
          This alert has no title, just a message.
        </Alert>
      </div>
    </template>);

    assert.dom('[data-test-alert="no-title"]').exists();
    assert.dom('[data-test-alert="no-title"] .alert-title').doesNotExist();

    await vizzlyScreenshot('alert-no-title');
  });
});
