import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click } from '@ember/test-helpers';
import Button from 'test-ember-app/components/button';
import { vizzlySnapshot } from '@vizzly-testing/ember/test-support';

module('Integration | Component | Button', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders all variants', async function (assert) {
    await render(<template>
      <div class="button-variants" style="display: flex; gap: 12px; padding: 20px;">
        <Button @variant="primary" @testId="primary">Primary</Button>
        <Button @variant="secondary" @testId="secondary">Secondary</Button>
        <Button @variant="danger" @testId="danger">Danger</Button>
        <Button @variant="ghost" @testId="ghost">Ghost</Button>
      </div>
    </template>);

    assert.dom('[data-test-button="primary"]').hasText('Primary');
    assert.dom('[data-test-button="secondary"]').hasText('Secondary');
    assert.dom('[data-test-button="danger"]').hasText('Danger');
    assert.dom('[data-test-button="ghost"]').hasText('Ghost');

    await vizzlySnapshot('button-variants');
  });

  test('it renders all sizes', async function (assert) {
    await render(<template>
      <div class="button-sizes" style="display: flex; align-items: center; gap: 12px; padding: 20px;">
        <Button @variant="primary" @size="small" @testId="small">Small</Button>
        <Button @variant="primary" @size="medium" @testId="medium">Medium</Button>
        <Button @variant="primary" @size="large" @testId="large">Large</Button>
      </div>
    </template>);

    assert.dom('[data-test-button="small"]').exists();
    assert.dom('[data-test-button="medium"]').exists();
    assert.dom('[data-test-button="large"]').exists();

    await vizzlySnapshot('button-sizes');
  });

  test('it renders disabled state', async function (assert) {
    await render(<template>
      <div class="button-disabled" style="display: flex; gap: 12px; padding: 20px;">
        <Button @variant="primary" @testId="enabled">Enabled</Button>
        <Button @variant="primary" @disabled={{true}} @testId="disabled">Disabled</Button>
      </div>
    </template>);

    assert.dom('[data-test-button="enabled"]').isNotDisabled();
    assert.dom('[data-test-button="disabled"]').isDisabled();

    await vizzlySnapshot('button-disabled-state');
  });

  test('it handles click events', async function (assert) {
    let clicked = false;
    let handleClick = () => { clicked = true; };

    await render(<template>
      <div style="padding: 20px;">
        <Button @variant="primary" @onClick={{handleClick}} @testId="clickable">
          Click Me
        </Button>
      </div>
    </template>);

    assert.false(clicked, 'Button not clicked yet');
    await click('[data-test-button="clickable"]');
    assert.true(clicked, 'Button was clicked');
  });
});
