import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, fillIn } from '@ember/test-helpers';
import FormField from 'test-ember-app/components/form-field';
import { vizzlyScreenshot } from '@vizzly-testing/ember/test-support';

module('Integration | Component | FormField', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders text input', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <FormField
          @name="username"
          @label="Username"
          @placeholder="Enter your username"
          @hint="Must be at least 3 characters"
        />
      </div>
    </template>);

    assert.dom('[data-test-form-field="username"]').exists();
    assert.dom('[data-test-form-field="username"] .form-label').hasText('Username');
    assert.dom('[data-test-form-field="username"] .form-hint').hasText('Must be at least 3 characters');

    await vizzlyScreenshot('form-field-text');
  });

  test('it renders with error state', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <FormField
          @name="email"
          @label="Email"
          @type="email"
          @value="invalid"
          @error="Please enter a valid email address"
          @required={{true}}
        />
      </div>
    </template>);

    assert.dom('[data-test-form-field="email"]').hasClass('has-error');
    assert.dom('[data-test-form-field="email"] .form-error').hasText('Please enter a valid email address');
    assert.dom('[data-test-form-field="email"] .required').exists();

    await vizzlyScreenshot('form-field-error');
  });

  test('it renders textarea', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <FormField
          @name="message"
          @label="Message"
          @type="textarea"
          @placeholder="Enter your message..."
          @rows={{4}}
        />
      </div>
    </template>);

    assert.dom('[data-test-form-field="message"] textarea').exists();

    await vizzlyScreenshot('form-field-textarea');
  });

  test('it renders disabled state', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px;">
        <FormField
          @name="readonly"
          @label="Read Only Field"
          @value="This field is disabled"
          @disabled={{true}}
        />
      </div>
    </template>);

    assert.dom('[data-test-form-field="readonly"] input').isDisabled();

    await vizzlyScreenshot('form-field-disabled');
  });

  test('it renders various input types', async function (assert) {
    await render(<template>
      <div style="padding: 20px; max-width: 400px; display: flex; flex-direction: column; gap: 16px;">
        <FormField
          @name="text"
          @label="Text Input"
          @type="text"
          @placeholder="Plain text"
        />

        <FormField
          @name="password"
          @label="Password"
          @type="password"
          @placeholder="Enter password"
        />

        <FormField
          @name="email-field"
          @label="Email"
          @type="email"
          @placeholder="you@example.com"
        />

        <FormField
          @name="number"
          @label="Number"
          @type="number"
          @placeholder="0"
        />
      </div>
    </template>);

    assert.dom('[data-test-form-field="text"] input').hasAttribute('type', 'text');
    assert.dom('[data-test-form-field="password"] input').hasAttribute('type', 'password');
    assert.dom('[data-test-form-field="email-field"] input').hasAttribute('type', 'email');
    assert.dom('[data-test-form-field="number"] input').hasAttribute('type', 'number');

    await vizzlyScreenshot('form-field-types');
  });
});
