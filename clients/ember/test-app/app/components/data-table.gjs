import Component from '@glimmer/component';
import { get } from '@ember/helper';

export default class DataTable extends Component {
  <template>
    <div class="table-container" data-test-data-table={{@testId}}>
      <table class="data-table">
        <thead>
          <tr>
            {{#each @columns as |column|}}
              <th class="table-header {{if column.align column.align}}">
                {{column.label}}
              </th>
            {{/each}}
          </tr>
        </thead>
        <tbody>
          {{#each @rows as |row index|}}
            <tr class="table-row {{if (this.isEven index) 'even'}}">
              {{#each @columns as |column|}}
                <td class="table-cell {{if column.align column.align}}">
                  {{get row column.key}}
                </td>
              {{/each}}
            </tr>
          {{else}}
            <tr>
              <td class="table-empty" colspan={{@columns.length}}>
                {{if @emptyMessage @emptyMessage "No data available"}}
              </td>
            </tr>
          {{/each}}
        </tbody>
      </table>
    </div>

    <style>
      .table-container {
        overflow-x: auto;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
      }

      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
      }

      .table-header {
        padding: 12px 16px;
        text-align: left;
        font-weight: 600;
        color: #374151;
        background: #f9fafb;
        border-bottom: 1px solid #e5e7eb;
        white-space: nowrap;
      }

      .table-header.center {
        text-align: center;
      }

      .table-header.right {
        text-align: right;
      }

      .table-cell {
        padding: 12px 16px;
        color: #111827;
        border-bottom: 1px solid #e5e7eb;
      }

      .table-cell.center {
        text-align: center;
      }

      .table-cell.right {
        text-align: right;
      }

      .table-row:last-child .table-cell {
        border-bottom: none;
      }

      .table-row.even {
        background: #f9fafb;
      }

      .table-row:hover {
        background: #eff6ff;
      }

      .table-empty {
        padding: 40px 16px;
        text-align: center;
        color: #6b7280;
      }
    </style>
  </template>

  isEven = (index) => index % 2 === 1;
}
