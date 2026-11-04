/** Keep project names, qualified selectors, and organizations distinct. */
export function showProjectTable(output, projects) {
  let showBuilds = projects.some(project => project.buildCount != null);
  let headers = [
    'Name',
    'Project',
    'Organization',
    ...(showBuilds ? ['Builds'] : []),
  ];
  let rows = projects.map(project => [
    project.name,
    `${project.organizationSlug}/${project.slug}`,
    project.organizationName || project.organizationSlug,
    ...(showBuilds ? [String(project.buildCount ?? '—')] : []),
  ]);
  let widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map(row => row[index].length))
  );
  let line = row =>
    row
      .map((value, index) => value.padEnd(widths[index]))
      .join('  ')
      .trimEnd();
  let colors = output.getColors();
  output.print(`  ${colors.dim(line(headers))}`);
  for (let row of rows) output.print(`  ${line(row)}`);
}
