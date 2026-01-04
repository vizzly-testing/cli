import Card from '../components/card';
import Button from '../components/button';
import Alert from '../components/alert';
import Modal from '../components/modal';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';

class ComponentsPageState {
  @tracked isModalOpen = false;
  @tracked modalSize = 'medium';

  openModal = (size) => {
    this.modalSize = size;
    this.isModalOpen = true;
  };

  closeModal = () => {
    this.isModalOpen = false;
  };
}

const state = new ComponentsPageState();

<template>
  <div class="page-components" data-test-page="components">
    <header class="page-header">
      <h1 class="page-title">Component Library</h1>
      <p class="page-subtitle">UI components available in this demo application</p>
    </header>

    <section class="component-section">
      <h2 class="section-title">Buttons</h2>

      <Card @testId="buttons-showcase">
        <div class="showcase-grid">
          <div class="showcase-item">
            <h3 class="showcase-label">Variants</h3>
            <div class="button-row">
              <Button @variant="primary" @testId="btn-primary">Primary</Button>
              <Button @variant="secondary" @testId="btn-secondary">Secondary</Button>
              <Button @variant="danger" @testId="btn-danger">Danger</Button>
              <Button @variant="ghost" @testId="btn-ghost">Ghost</Button>
            </div>
          </div>

          <div class="showcase-item">
            <h3 class="showcase-label">Sizes</h3>
            <div class="button-row">
              <Button @variant="primary" @size="small" @testId="btn-small">Small</Button>
              <Button @variant="primary" @size="medium" @testId="btn-medium">Medium</Button>
              <Button @variant="primary" @size="large" @testId="btn-large">Large</Button>
            </div>
          </div>

          <div class="showcase-item">
            <h3 class="showcase-label">States</h3>
            <div class="button-row">
              <Button @variant="primary" @testId="btn-enabled">Enabled</Button>
              <Button @variant="primary" @disabled={{true}} @testId="btn-disabled">Disabled</Button>
            </div>
          </div>
        </div>
      </Card>
    </section>

    <section class="component-section">
      <h2 class="section-title">Alerts</h2>

      <Card @testId="alerts-showcase">
        <div class="alerts-stack">
          <Alert @variant="info" @title="Information" @testId="alert-info">
            This is an informational message for the user.
          </Alert>

          <Alert @variant="success" @title="Success" @testId="alert-success">
            Your changes have been saved successfully.
          </Alert>

          <Alert @variant="warning" @title="Warning" @testId="alert-warning">
            Please review your settings before proceeding.
          </Alert>

          <Alert @variant="error" @title="Error" @testId="alert-error">
            Something went wrong. Please try again later.
          </Alert>
        </div>
      </Card>
    </section>

    <section class="component-section">
      <h2 class="section-title">Modals</h2>

      <Card @testId="modals-showcase">
        <p class="showcase-description">
          Click the buttons below to open modals of different sizes.
        </p>
        <div class="button-row">
          <Button @variant="primary" @onClick={{fn state.openModal "small"}} @testId="open-modal-small">
            Small Modal
          </Button>
          <Button @variant="primary" @onClick={{fn state.openModal "medium"}} @testId="open-modal-medium">
            Medium Modal
          </Button>
          <Button @variant="primary" @onClick={{fn state.openModal "large"}} @testId="open-modal-large">
            Large Modal
          </Button>
        </div>
      </Card>

      <Modal
        @isOpen={{state.isModalOpen}}
        @title="Example Modal"
        @size={{state.modalSize}}
        @onClose={{state.closeModal}}
        @testId="demo-modal"
      >
        <:default>
          <p>This is a {{state.modalSize}} modal dialog. You can put any content here.</p>
          <p>Click the close button or outside the modal to dismiss it.</p>
        </:default>

        <:footer>
          <Button @variant="secondary" @onClick={{state.closeModal}}>Cancel</Button>
          <Button @variant="primary" @onClick={{state.closeModal}}>Confirm</Button>
        </:footer>
      </Modal>
    </section>

    <section class="component-section">
      <h2 class="section-title">Cards</h2>

      <div class="cards-grid">
        <Card @title="Basic Card" @testId="card-basic">
          <p>This is a basic card with a title and some content.</p>
        </Card>

        <Card @title="Card with Actions" @testId="card-actions">
          <:actions>
            <Button @variant="ghost" @size="small">Edit</Button>
          </:actions>
          <:default>
            <p>This card has action buttons in the header.</p>
          </:default>
        </Card>

        <Card @title="Card with Footer" @testId="card-footer">
          <:default>
            <p>This card has a footer section for additional actions.</p>
          </:default>
          <:footer>
            <Button @variant="secondary" @size="small">Cancel</Button>
            <Button @variant="primary" @size="small">Save</Button>
          </:footer>
        </Card>

        <Card @title="Elevated Card" @elevated={{true}} @testId="card-elevated">
          <p>This card has elevation (shadow) for visual hierarchy.</p>
        </Card>
      </div>
    </section>
  </div>

  <style>
    .page-components {
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 32px;
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

    .component-section {
      margin-bottom: 40px;
    }

    .section-title {
      margin: 0 0 16px 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }

    .showcase-grid {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .showcase-item {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .showcase-label {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
    }

    .showcase-description {
      margin: 0 0 16px 0;
      color: #6b7280;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .alerts-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
  </style>
</template>
