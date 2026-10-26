# Chrome browser flags

The Storybook and static-site plugins launch browsers with Playwright. Ember
uses fewer flags because Testem handles starting and stopping the browser.

## Where to change them

- `clients/storybook/src/browser.js`
- `clients/static-site/src/browser.js`
- `clients/ember/src/launcher/browser.js`

Check Chrome's [flags for automation tools](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md)
when updating these. The [Chromium switch list](https://peter.sh/experiments/chromium-command-line-switches/)
and Playwright's default arguments are also useful references.

## Current flags

These apply to Chromium. Firefox and WebKit only use the arguments you pass.

| Flag | Why we use it |
| --- | --- |
| `--no-sandbox` | Run in containers without Chrome's sandbox. |
| `--disable-setuid-sandbox` | Disable the Linux setuid sandbox. |
| `--disable-dev-shm-usage` | Use `/tmp` when Docker's `/dev/shm` is too small. |
| `--disable-extensions` | Skip extensions. |
| `--disable-default-apps` | Skip default app installation. |
| `--disable-sync` | Skip Google account sync. |
| `--disable-breakpad` | Skip crash reporting. |
| `--disable-component-update` | Skip component updates after startup. |
| `--disable-background-networking` | Skip background network requests. |
| `--disable-background-timer-throttling` | Keep background timers running normally. |
| `--disable-backgrounding-occluded-windows` | Keep covered windows active. |
| `--disable-renderer-backgrounding` | Keep renderer processes active. |
| `--disable-hang-monitor` | Skip hang dialogs. |
| `--disable-ipc-flooding-protection` | Disable IPC rate limiting. |
| `--disable-popup-blocking` | Allow popups during tests. |
| `--disable-prompt-on-repost` | Skip form resubmission prompts. |
| `--disable-features=Translate,OptimizationHints,MediaRouter` | Skip translation prompts, optimization hints, and Cast networking. |
| `--metrics-recording-only` | Record metrics without sending them. |
| `--no-first-run` | Skip first-run dialogs. |
| `--hide-scrollbars` | Keep scrollbars out of screenshots. |
| `--mute-audio` | Mute audio. |
| `--force-color-profile=srgb` | Use the same color profile across machines. |
| `--js-flags=--max-old-space-size=N` | Limit the V8 heap: 512 MB for static-site, 1024 MB for Storybook. |

Ember always uses the two sandbox flags. In CI it also adds
`--disable-dev-shm-usage` and `--disable-extensions`.

## Old flags to avoid

| Flag | Use instead |
| --- | --- |
| `--disable-gpu` | Leave GPU handling to headless Chrome. |
| `--disable-software-rasterizer` | Leave it out; using it with `--disable-gpu` can cause hangs. |
| `--disable-translate` | `--disable-features=Translate`. |
| `--safebrowsing-disable-auto-update` | Leave it out. |
| `--disable-infobars` | Leave it out. |
| `--headless=new` | `--headless`. |
