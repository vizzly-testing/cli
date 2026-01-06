import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import Card from 'test-ember-app/components/card';
import Button from 'test-ember-app/components/button';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Integration | Component | Card', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders basic card', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <Card @title="Basic Card" @testId="basic">
          <p style="margin: 0;">This is the card content.</p>
        </Card>
      </div>
    </template>);

    assert.dom('[data-test-card="basic"]').exists();
    assert.dom('[data-test-card="basic"] .card-title').hasText('Basic Card');

    await vizzlyScreenshot('card-basic');
  });

  test('it renders elevated card', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <Card @title="Elevated Card" @elevated={{true}} @testId="elevated">
          <p style="margin: 0;">This card has a shadow for visual elevation.</p>
        </Card>
      </div>
    </template>);

    assert.dom('[data-test-card="elevated"]').hasClass('elevated');

    await vizzlyScreenshot('card-elevated');
  });

  test('it renders card with actions and footer', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <Card @title="Full Featured Card" @testId="full">
          <:actions>
            <Button @variant="ghost" @size="small">Edit</Button>
          </:actions>

          <:default>
            <p style="margin: 0;">This card has header actions and a footer.</p>
          </:default>

          <:footer>
            <Button @variant="secondary" @size="small">Cancel</Button>
            <Button @variant="primary" @size="small">Save</Button>
          </:footer>
        </Card>
      </div>
    </template>);

    assert.dom('[data-test-card="full"] .card-actions').exists();
    assert.dom('[data-test-card="full"] .card-footer').exists();

    await vizzlyScreenshot('card-with-actions-footer');
  });

  test('it renders card without title', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <Card @testId="no-title">
          <p style="margin: 0;">This card has no title header.</p>
        </Card>
      </div>
    </template>);

    assert.dom('[data-test-card="no-title"] .card-header').doesNotExist();

    await vizzlyScreenshot('card-no-title');
  });
});
