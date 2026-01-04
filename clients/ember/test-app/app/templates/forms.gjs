import Card from '../components/card';
import Button from '../components/button';
import FormField from '../components/form-field';
import Alert from '../components/alert';

<template>
  <div class="page-forms" data-test-page="forms">
    <header class="page-header">
      <h1 class="page-title">Form Examples</h1>
      <p class="page-subtitle">Various form states and validation scenarios</p>
    </header>

    <div class="forms-grid">
      <Card @title="Login Form" @testId="login-form">
        <:default>
          <div class="form-stack">
            <FormField
              @name="email"
              @label="Email Address"
              @type="email"
              @placeholder="you@example.com"
              @required={{true}}
            />

            <FormField
              @name="password"
              @label="Password"
              @type="password"
              @placeholder="Enter your password"
              @required={{true}}
            />
          </div>
        </:default>

        <:footer>
          <Button @variant="primary" @testId="login-submit">Sign In</Button>
          <Button @variant="ghost" @testId="forgot-password">Forgot Password?</Button>
        </:footer>
      </Card>

      <Card @title="Form with Errors" @testId="error-form">
        <:default>
          <Alert @variant="error" @testId="form-error">
            Please fix the errors below before submitting.
          </Alert>

          <div class="form-stack" style="margin-top: 16px;">
            <FormField
              @name="username"
              @label="Username"
              @value="a"
              @error="Username must be at least 3 characters"
              @required={{true}}
            />

            <FormField
              @name="email-invalid"
              @label="Email"
              @value="not-an-email"
              @error="Please enter a valid email address"
              @required={{true}}
            />
          </div>
        </:default>

        <:footer>
          <Button @variant="primary" @disabled={{true}}>Submit</Button>
        </:footer>
      </Card>

      <Card @title="Contact Form" @testId="contact-form">
        <:default>
          <div class="form-stack">
            <div class="form-row">
              <FormField
                @name="first-name"
                @label="First Name"
                @placeholder="John"
              />

              <FormField
                @name="last-name"
                @label="Last Name"
                @placeholder="Doe"
              />
            </div>

            <FormField
              @name="subject"
              @label="Subject"
              @placeholder="How can we help?"
            />

            <FormField
              @name="message"
              @label="Message"
              @type="textarea"
              @placeholder="Tell us more about your inquiry..."
              @rows={{5}}
              @hint="Maximum 500 characters"
            />
          </div>
        </:default>

        <:footer>
          <Button @variant="secondary" @testId="clear">Clear</Button>
          <Button @variant="primary" @testId="send">Send Message</Button>
        </:footer>
      </Card>

      <Card @title="Disabled Form" @testId="disabled-form">
        <:default>
          <Alert @variant="warning" @testId="disabled-notice">
            This form is currently disabled for maintenance.
          </Alert>

          <div class="form-stack" style="margin-top: 16px;">
            <FormField
              @name="disabled-field"
              @label="Name"
              @value="John Doe"
              @disabled={{true}}
            />

            <FormField
              @name="disabled-email"
              @label="Email"
              @value="john@example.com"
              @disabled={{true}}
            />
          </div>
        </:default>

        <:footer>
          <Button @variant="primary" @disabled={{true}}>Submit</Button>
        </:footer>
      </Card>
    </div>
  </div>

  <style>
    .page-forms {
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

    .forms-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
    }

    .form-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
  </style>
</template>
