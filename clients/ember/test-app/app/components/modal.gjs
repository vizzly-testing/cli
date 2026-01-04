import Component from '@glimmer/component';
import { on } from '@ember/modifier';

export default class Modal extends Component {
  <template>
    {{#if @isOpen}}
      <div class="modal-backdrop" data-test-modal={{@testId}} {{on "click" this.handleBackdropClick}}>
        <div class="modal {{if @size @size 'medium'}}" role="dialog" aria-modal="true" {{on "click" this.stopPropagation}}>
          <div class="modal-header">
            <h2 class="modal-title">{{@title}}</h2>
            {{#if @onClose}}
              <button type="button" class="modal-close" aria-label="Close" {{on "click" @onClose}}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            {{/if}}
          </div>

          <div class="modal-body">
            {{yield}}
          </div>

          {{#if (has-block "footer")}}
            <div class="modal-footer">
              {{yield to="footer"}}
            </div>
          {{/if}}
        </div>
      </div>
    {{/if}}

    <style>
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
      }

      .modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
        max-height: calc(100vh - 40px);
        display: flex;
        flex-direction: column;
        animation: modalIn 0.2s ease-out;
      }

      @keyframes modalIn {
        from {
          opacity: 0;
          transform: scale(0.95);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .modal.small {
        width: 400px;
        max-width: 100%;
      }

      .modal.medium {
        width: 560px;
        max-width: 100%;
      }

      .modal.large {
        width: 800px;
        max-width: 100%;
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        border-bottom: 1px solid #e5e7eb;
      }

      .modal-title {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #111827;
      }

      .modal-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 6px;
        color: #6b7280;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .modal-close:hover {
        background: #f3f4f6;
        color: #111827;
      }

      .modal-body {
        padding: 24px;
        overflow-y: auto;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 24px;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
      }
    </style>
  </template>

  handleBackdropClick = (event) => {
    if (this.args.onClose && event.target === event.currentTarget) {
      this.args.onClose();
    }
  };

  stopPropagation = (event) => {
    event.stopPropagation();
  };
}
