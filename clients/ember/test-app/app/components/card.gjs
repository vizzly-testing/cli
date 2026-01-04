import Component from '@glimmer/component';

export default class Card extends Component {
  <template>
    <div class="card {{if @elevated 'elevated'}}" data-test-card={{@testId}}>
      {{#if @title}}
        <div class="card-header">
          <h3 class="card-title">{{@title}}</h3>
          {{#if (has-block "actions")}}
            <div class="card-actions">
              {{yield to="actions"}}
            </div>
          {{/if}}
        </div>
      {{/if}}

      <div class="card-body">
        {{yield}}
      </div>

      {{#if (has-block "footer")}}
        <div class="card-footer">
          {{yield to="footer"}}
        </div>
      {{/if}}
    </div>

    <style>
      .card {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
      }

      .card.elevated {
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        border: none;
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
      }

      .card-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #111827;
      }

      .card-actions {
        display: flex;
        gap: 8px;
      }

      .card-body {
        padding: 20px;
      }

      .card-footer {
        padding: 16px 20px;
        border-top: 1px solid #e5e7eb;
        background: #f9fafb;
      }
    </style>
  </template>
}
