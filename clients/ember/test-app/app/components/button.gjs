import Component from '@glimmer/component';
import { on } from '@ember/modifier';

export default class Button extends Component {
  <template>
    <button
      type={{if @type @type "button"}}
      class="button {{if @variant @variant 'primary'}} {{if @size @size 'medium'}}"
      disabled={{@disabled}}
      data-test-button={{@testId}}
      {{on "click" (if @onClick @onClick this.noop)}}
    >
      {{yield}}
    </button>

    <style>
      .button {
        font-family: system-ui, -apple-system, sans-serif;
        font-weight: 500;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Sizes */
      .button.small {
        padding: 6px 12px;
        font-size: 13px;
      }

      .button.medium {
        padding: 10px 20px;
        font-size: 14px;
      }

      .button.large {
        padding: 14px 28px;
        font-size: 16px;
      }

      /* Variants */
      .button.primary {
        background: #3b82f6;
        color: white;
      }

      .button.primary:hover:not(:disabled) {
        background: #2563eb;
      }

      .button.secondary {
        background: #e5e7eb;
        color: #374151;
      }

      .button.secondary:hover:not(:disabled) {
        background: #d1d5db;
      }

      .button.danger {
        background: #ef4444;
        color: white;
      }

      .button.danger:hover:not(:disabled) {
        background: #dc2626;
      }

      .button.ghost {
        background: transparent;
        color: #3b82f6;
        border: 1px solid #3b82f6;
      }

      .button.ghost:hover:not(:disabled) {
        background: #eff6ff;
      }
    </style>
  </template>

  noop = () => {};
}
