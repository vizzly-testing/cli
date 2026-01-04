import Component from '@glimmer/component';
import { on } from '@ember/modifier';

export default class FormField extends Component {
  <template>
    <div class="form-field {{if @error 'has-error'}}" data-test-form-field={{@name}}>
      {{#if @label}}
        <label class="form-label" for={{@name}}>
          {{@label}}
          {{#if @required}}
            <span class="required">*</span>
          {{/if}}
        </label>
      {{/if}}

      {{#if (this.isTextarea @type)}}
        <textarea
          id={{@name}}
          name={{@name}}
          class="form-input"
          placeholder={{@placeholder}}
          disabled={{@disabled}}
          rows={{if @rows @rows 3}}
          {{on "input" (if @onInput @onInput this.noop)}}
        >{{@value}}</textarea>
      {{else}}
        <input
          id={{@name}}
          name={{@name}}
          type={{if @type @type "text"}}
          class="form-input"
          value={{@value}}
          placeholder={{@placeholder}}
          disabled={{@disabled}}
          {{on "input" (if @onInput @onInput this.noop)}}
        />
      {{/if}}

      {{#if @error}}
        <p class="form-error">{{@error}}</p>
      {{/if}}

      {{#if @hint}}
        <p class="form-hint">{{@hint}}</p>
      {{/if}}
    </div>

    <style>
      .form-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-label {
        font-size: 14px;
        font-weight: 500;
        color: #374151;
      }

      .form-label .required {
        color: #ef4444;
        margin-left: 2px;
      }

      .form-input {
        padding: 10px 12px;
        font-size: 14px;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        background: white;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }

      .form-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgb(59 130 246 / 0.1);
      }

      .form-input:disabled {
        background: #f3f4f6;
        cursor: not-allowed;
      }

      .has-error .form-input {
        border-color: #ef4444;
      }

      .has-error .form-input:focus {
        box-shadow: 0 0 0 3px rgb(239 68 68 / 0.1);
      }

      .form-error {
        margin: 0;
        font-size: 13px;
        color: #ef4444;
      }

      .form-hint {
        margin: 0;
        font-size: 13px;
        color: #6b7280;
      }

      textarea.form-input {
        resize: vertical;
        min-height: 80px;
      }
    </style>
  </template>

  isTextarea = (type) => type === 'textarea';
  noop = () => {};
}
