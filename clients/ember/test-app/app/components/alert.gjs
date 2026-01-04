import Component from '@glimmer/component';

export default class Alert extends Component {
  <template>
    <div class="alert {{if @variant @variant 'info'}}" role="alert" data-test-alert={{@testId}}>
      <div class="alert-icon">
        {{#if (this.isSuccess @variant)}}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fill="currentColor"/>
          </svg>
        {{else if (this.isError @variant)}}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="currentColor"/>
          </svg>
        {{else if (this.isWarning @variant)}}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" fill="currentColor"/>
          </svg>
        {{else}}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" fill="currentColor"/>
          </svg>
        {{/if}}
      </div>
      <div class="alert-content">
        {{#if @title}}
          <p class="alert-title">{{@title}}</p>
        {{/if}}
        <p class="alert-message">{{yield}}</p>
      </div>
    </div>

    <style>
      .alert {
        display: flex;
        gap: 12px;
        padding: 16px;
        border-radius: 8px;
      }

      .alert-icon {
        flex-shrink: 0;
      }

      .alert-content {
        flex: 1;
        min-width: 0;
      }

      .alert-title {
        margin: 0 0 4px 0;
        font-weight: 600;
        font-size: 14px;
      }

      .alert-message {
        margin: 0;
        font-size: 14px;
      }

      /* Info */
      .alert.info {
        background: #eff6ff;
        color: #1e40af;
      }

      /* Success */
      .alert.success {
        background: #f0fdf4;
        color: #166534;
      }

      /* Warning */
      .alert.warning {
        background: #fffbeb;
        color: #92400e;
      }

      /* Error */
      .alert.error {
        background: #fef2f2;
        color: #991b1b;
      }
    </style>
  </template>

  isSuccess = (variant) => variant === 'success';
  isError = (variant) => variant === 'error';
  isWarning = (variant) => variant === 'warning';
}
