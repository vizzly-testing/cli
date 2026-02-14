import { expect } from '@playwright/test';

/**
 * Wait until the fullscreen viewer has rendered stable pixels for snapshotting.
 */
export async function waitForFullscreenViewerReady(page) {
  let viewer = page.getByTestId('fullscreen-viewer');
  await expect(viewer).toBeVisible();

  await page.evaluate(async () => {
    if (document.fonts && document.fonts.status !== 'loaded') {
      await document.fonts.ready;
    }

    let root = document.querySelector('[data-testid="fullscreen-viewer"]');
    if (!root) return;

    let visibleImages = Array.from(root.querySelectorAll('img')).filter(img => {
      let rect = img.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      let style = window.getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
      }

      return true;
    });

    await Promise.all(
      visibleImages.map(async img => {
        if (img.complete && img.naturalWidth > 0) {
          return;
        }

        if (typeof img.decode === 'function') {
          try {
            await img.decode();
            return;
          } catch {
            // Fall through to load/error listeners when decode() rejects.
          }
        }

        await new Promise(resolve => {
          let finish = () => {
            img.removeEventListener('load', finish);
            img.removeEventListener('error', finish);
            resolve();
          };

          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', finish, { once: true });
        });
      })
    );

    await new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  });
}

export async function screenshotFullscreenViewer(page) {
  await waitForFullscreenViewerReady(page);
  return await page.getByTestId('fullscreen-viewer').screenshot();
}
