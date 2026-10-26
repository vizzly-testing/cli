import { compareHeightChange } from '../support/height-change-capture.js';
import { reportFixture } from '../support/report-data.js';
import { expect, test } from '../support/reporter-test.js';

test.use({ reportData: reportFixture('empty-state') });

for (let [direction, label] of [
  ['added', 'Added'],
  ['removed', 'Removed'],
]) {
  test(`${direction} rows survive native comparison and appear in the gutter`, async ({
    browser,
    page,
    reporter,
    openReview,
    capture,
  }) => {
    let comparison = await compareHeightChange(
      browser,
      page.request,
      reporter,
      direction
    );
    expect(comparison.status).toBe('failed');
    expect(comparison.heightChange).toMatchObject({
      direction,
      rowCount: 120,
      alignmentApplied: true,
    });
    let startRow = comparison.heightChange.startRow;
    expect(startRow).toBeGreaterThanOrEqual(0);
    expect(startRow).toBeLessThan(600);
    expect(comparison.heightDiff).toBe(direction === 'added' ? 120 : -120);
    await openReview(comparison.id);
    let gutter = page.getByRole('navigation', { name: 'Changes', exact: true });
    let band = gutter.getByRole('button', {
      name: new RegExp(`^${label} · .*120 rows$`),
    });
    let stepper = page.getByRole('toolbar', { name: 'Step through changes' });
    await band.click();
    await page.mouse.move(page.viewportSize().width - 5, 115);
    await expect(band).toHaveAttribute('aria-current', 'true');
    await expect(stepper).toContainText(/\d+ of \d+/);
    await expect(band).toBeInViewport();
    await expect(
      page.getByRole('status').filter({ hasText: label })
    ).toContainText('120 rows');
    let rows =
      direction === 'added'
        ? `Rows ${startRow}–${startRow + 120}`
        : `Row ${startRow}`;
    await expect(
      page.getByRole('status').filter({ hasText: label })
    ).toContainText(rows);
    await capture(`review-${direction}-rows`);
  });
}
