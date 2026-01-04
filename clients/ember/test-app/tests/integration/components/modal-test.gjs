import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click } from '@ember/test-helpers';
import Modal from 'test-ember-app/components/modal';
import Button from 'test-ember-app/components/button';
import { vizzlySnapshot } from '@vizzly-testing/ember/test-support';

module('Integration | Component | Modal', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders when open', async function (assert) {
    await render(<template>
      <Modal @isOpen={{true}} @title="Test Modal" @testId="test-modal">
        <p>This is the modal content.</p>
      </Modal>
    </template>);

    assert.dom('[data-test-modal="test-modal"]').exists();
    assert.dom('.modal-title').hasText('Test Modal');

    await vizzlySnapshot('modal-open');
  });

  test('it does not render when closed', async function (assert) {
    await render(<template>
      <Modal @isOpen={{false}} @title="Hidden Modal" @testId="hidden-modal">
        <p>You should not see this.</p>
      </Modal>
    </template>);

    assert.dom('[data-test-modal="hidden-modal"]').doesNotExist();
  });

  test('it renders different sizes', async function (assert) {
    await render(<template>
      <Modal @isOpen={{true}} @title="Small Modal" @size="small" @testId="small-modal">
        <p>This is a small modal.</p>
      </Modal>
    </template>);

    assert.dom('.modal').hasClass('small');
    await vizzlySnapshot('modal-small');
  });

  test('it renders large modal', async function (assert) {
    await render(<template>
      <Modal @isOpen={{true}} @title="Large Modal" @size="large" @testId="large-modal">
        <p>This is a large modal with more space for content.</p>
        <p>It can contain longer forms or detailed information.</p>
      </Modal>
    </template>);

    assert.dom('.modal').hasClass('large');
    await vizzlySnapshot('modal-large');
  });

  test('it renders with footer', async function (assert) {
    await render(<template>
      <Modal @isOpen={{true}} @title="Modal with Actions" @testId="modal-footer">
        <:default>
          <p>Please confirm your action.</p>
        </:default>

        <:footer>
          <Button @variant="secondary">Cancel</Button>
          <Button @variant="primary">Confirm</Button>
        </:footer>
      </Modal>
    </template>);

    assert.dom('.modal-footer').exists();
    await vizzlySnapshot('modal-with-footer');
  });

  test('it calls onClose when close button clicked', async function (assert) {
    let closed = false;
    let handleClose = () => { closed = true; };

    await render(<template>
      <Modal @isOpen={{true}} @title="Closeable Modal" @onClose={{handleClose}} @testId="closeable">
        <p>Click the X to close.</p>
      </Modal>
    </template>);

    assert.false(closed, 'Modal not closed yet');
    await click('.modal-close');
    assert.true(closed, 'Modal onClose was called');
  });
});
