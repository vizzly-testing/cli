# Chrome Browser Flags

This document covers the Chrome command-line flags used by the Storybook and Static-Site SDKs when launching Puppeteer browsers.

## Source of Truth

The authoritative reference for Chrome flags is maintained by the Chrome team:

- **Primary**: [Chrome Flags for Tools](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md) - Curated list for automation tools
- **Complete list**: [peter.sh/experiments/chromium-command-line-switches](https://peter.sh/experiments/chromium-command-line-switches/) - All Chromium switches

When auditing or updating flags, always check these sources. Flags get deprecated/removed over time.

## Current Flags

Located in:
- `clients/storybook/src/browser.js`
- `clients/static-site/src/browser.js`

### Container/CI Requirements

| Flag | Purpose |
|------|---------|
| `--no-sandbox` | Required for running in containers without root |
| `--disable-setuid-sandbox` | Disable setuid sandbox (Linux only) |
| `--disable-dev-shm-usage` | Use /tmp instead of /dev/shm (often too small in Docker) |

### Disable Unnecessary Features

| Flag | Purpose |
|------|---------|
| `--disable-extensions` | Disable all Chrome extensions |
| `--disable-default-apps` | Disable installation of default apps |
| `--disable-sync` | Disable syncing to Google account |
| `--disable-breakpad` | Disable crash reporting |
| `--disable-component-update` | Don't update components after startup |

### Task Throttling

These prevent Chrome from throttling background tabs/processes, ensuring consistent behavior:

| Flag | Purpose |
|------|---------|
| `--disable-background-timer-throttling` | Don't throttle timers in background pages |
| `--disable-backgrounding-occluded-windows` | Don't background occluded windows |
| `--disable-renderer-backgrounding` | Prevent renderer process backgrounding |
| `--disable-hang-monitor` | Suppress hang monitor dialogs |
| `--disable-ipc-flooding-protection` | Disable IPC rate limiting |
| `--disable-background-networking` | Disable background network requests |

### Interactivity Suppression

| Flag | Purpose |
|------|---------|
| `--disable-popup-blocking` | Allow popups (for testing) |
| `--disable-prompt-on-repost` | Don't prompt on form resubmission |

### Feature Flags (Modern Approach)

Use `--disable-features=` for toggling Chrome features:

| Feature | Purpose |
|---------|---------|
| `Translate` | Disable translation prompts |
| `OptimizationHints` | Disable Chrome Optimization Guide networking |
| `MediaRouter` | Disable Cast/media router networking |

### Resource Reduction

| Flag | Purpose |
|------|---------|
| `--metrics-recording-only` | Record but don't send metrics |
| `--no-first-run` | Skip first-run wizards and dialogs |

### Screenshot Consistency

| Flag | Purpose |
|------|---------|
| `--hide-scrollbars` | Hide scrollbars from screenshots |
| `--mute-audio` | Mute any audio |
| `--force-color-profile=srgb` | Consistent color rendering across machines |

### Memory

| Flag | Purpose |
|------|---------|
| `--js-flags=--max-old-space-size=N` | Limit V8 heap (512MB static-site, 1024MB storybook) |

## Removed Flags

These flags were removed from Chromium and should NOT be used:

| Flag | Removed | Replacement |
|------|---------|-------------|
| `--disable-gpu` | 2021 | Not needed in headless mode |
| `--disable-software-rasterizer` | - | Causes hangs with --disable-gpu |
| `--disable-translate` | April 2017 | `--disable-features=Translate` |
| `--safebrowsing-disable-auto-update` | Nov 2017 | None needed |
| `--disable-infobars` | May 2019 | None |
| `--headless=new` | Jan 2025 | Just use `--headless` |

## Auditing Flags

Periodically audit flags against the source of truth:

1. Check [chrome-flags-for-tools.md](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md) for the "Removed flags" section
2. Verify each flag still exists on [peter.sh](https://peter.sh/experiments/chromium-command-line-switches/)
3. Check Puppeteer's default args for any new recommendations

Last audited: January 2026
