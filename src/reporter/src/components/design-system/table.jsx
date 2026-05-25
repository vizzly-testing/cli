/**
 * Table Component
 * BearDen Design System
 *
 * Styled data table with sorting and row actions
 */

export function Table({
  columns = [],
  data = [],
  onRowClick,
  emptyMessage = 'No data available',
  className = '',
}) {
  if (!data.length) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--vz-border-subtle)]">
            {columns.map((column, index) => (
              <th
                key={column.key || index}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--vz-border-subtle)]">
          {data.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              onClick={() => onRowClick?.(row)}
              className={`transition-colors ${onRowClick ? 'cursor-pointer hover:bg-white/[0.02]' : ''}`}
            >
              {columns.map((column, colIndex) => (
                <td
                  key={column.key || colIndex}
                  className="px-4 py-4 text-sm text-[var(--text-secondary)]"
                >
                  {column.render
                    ? column.render(row[column.key], row)
                    : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
