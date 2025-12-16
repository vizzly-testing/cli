# TUI Elements Reference

The Vizzly CLI includes a comprehensive terminal UI toolkit for consistent, beautiful output across all commands. This guide documents the available helpers and how to use them.

## Design System

The TUI elements follow the **Observatory Design System** - Vizzly's visual language. Key characteristics:

- **Amber** (`#F59E0B`) is the signature brand color used for primary actions and highlights
- **Semantic colors** communicate meaning consistently (green=success, red=error, amber=warning, blue=info)
- **Text hierarchy** uses four levels for clear information architecture
- **Dark theme first** - colors are optimized for dark terminal backgrounds

## Quick Reference

| Helper | Purpose | Example |
|--------|---------|---------|
| `header()` | Command branding | `header('tdd', 'local')` |
| `success()` | Success message with checkmark | `success('Build uploaded')` |
| `result()` | Final result with timing | `result('5 screenshots')` |
| `complete()` | Completion message | `complete('Ready', { detail: 'port 47392' })` |
| `error()` | Error message | `error('Failed', err)` |
| `warn()` | Warning message | `warn('Token expires soon')` |
| `info()` | Info message | `info('Processing started')` |
| `debug()` | Debug with component | `debug('server', 'listening', { port: 47392 })` |
| `list()` | Bullet point list | `list(['Item 1', 'Item 2'])` |
| `keyValue()` | Key-value table | `keyValue({ Name: 'build-123' })` |
| `labelValue()` | Single key-value | `labelValue('Status', 'ready')` |
| `hint()` | Muted tip/hint | `hint('Use --verbose for details')` |
| `divider()` | Separator line | `divider({ width: 40 })` |
| `box()` | Bordered box | `box('Dashboard ready')` |
| `printBox()` | Print box to stderr | `printBox('Content', { title: 'Info' })` |
| `diffBar()` | Visual diff bar | `diffBar(4.2)` |
| `progressBar()` | Gradient progress | `progressBar(75, 100)` |
| `badge()` | Status badge | `badge('READY', 'success')` |
| `statusDot()` | Colored dot | `statusDot('success')` |
| `link()` | Styled URL | `link('Dashboard', 'http://...')` |
| `startSpinner()` | Animated spinner | `startSpinner('Loading...')` |
| `progress()` | Progress update | `progress('Uploading', 5, 10)` |

## Import

```javascript
import * as output from '../utils/output.js';

// Or import specific functions
import {
  header,
  success,
  error,
  keyValue,
  startSpinner
} from '../utils/output.js';
```

## Configuration

Call `configure()` at the start of your command to set output options:

```javascript
output.configure({
  json: globalOptions.json,      // Enable JSON output mode
  verbose: globalOptions.verbose, // Enable debug logging
  color: !globalOptions.noColor,  // Enable/disable colors
  silent: false,                  // Suppress all output
  logFile: null,                  // Path to log file
  resetTimer: true                // Reset elapsed timer (default: true)
});
```

## Visual Elements

### Header

Show command branding at the start of output. Uses amber for "vizzly", info blue for command name, and muted text for mode.

```javascript
output.header('tdd', 'local');
// Output:
//
// vizzly · tdd · local
//
```

The header automatically:
- Only shows once per command execution
- Skips in JSON or silent mode
- Uses brand colors from Observatory

### Box

Create bordered boxes for important information:

```javascript
// Simple box
output.printBox('Dashboard: http://localhost:47392');
// ╭───────────────────────────────────────╮
// │  Dashboard: http://localhost:47392    │
// ╰───────────────────────────────────────╯

// Box with title
output.printBox('Server started successfully', {
  title: 'Ready',
  style: 'branded'  // Uses amber border
});
// ╭─ Ready ────────────────────────────────╮
// │  Server started successfully           │
// ╰────────────────────────────────────────╯

// Multi-line content
output.printBox([
  'Dashboard: http://localhost:47392',
  'API: http://localhost:47392/api'
]);
```

Options:
- `title` - Optional title in border
- `padding` - Horizontal padding (default: 1)
- `borderColor` - Color function for border
- `style` - `'default'` or `'branded'` (amber border)

### Diff Bar

Color-coded visual representation of diff percentages:

```javascript
output.diffBar(0.5);   // ████░░░░░░ (green - minimal)
output.diffBar(4.2);   // ████░░░░░░ (amber - attention)
output.diffBar(15.0);  // ██████░░░░ (red - significant)
```

Color thresholds:
- `< 1%` - Success green (minimal change)
- `1-5%` - Warning amber (attention needed)
- `> 5%` - Danger red (significant change)

### Progress Bar

Gradient progress indicator using amber brand colors:

```javascript
let bar = output.progressBar(75, 100);
// ███████████████░░░░░ (amber gradient)

// Custom colors
let bar = output.progressBar(50, 100, 20, {
  from: '#10B981',  // Start color
  to: '#34D399'     // End color
});
```

### Badge

Status badges with background colors:

```javascript
output.badge('READY', 'success');   // Green background
output.badge('PENDING', 'warning'); // Amber background
output.badge('FAILED', 'error');    // Red background
output.badge('SYNC', 'info');       // Blue background
```

### Status Dot

Simple colored status indicators:

```javascript
output.statusDot('success');  // ● (green)
output.statusDot('warning');  // ● (amber)
output.statusDot('error');    // ● (red)
output.statusDot('info');     // ● (blue)
```

### Divider

Visual separator line:

```javascript
output.divider();
// ────────────────────────────────────────

output.divider({ width: 20, char: '═' });
// ════════════════════
```

## Text Formatting

### List

Bullet point lists with style variants:

```javascript
// Default style (muted bullets)
output.list(['Item one', 'Item two', 'Item three']);
//   • Item one
//   • Item two
//   • Item three

// Success style (green checkmarks)
output.list(['Config loaded', 'Server started'], { style: 'success' });
//   ✓ Config loaded
//   ✓ Server started

// Warning style (amber exclamation)
output.list(['Missing token', 'Outdated config'], { style: 'warning' });
//   ! Missing token
//   ! Outdated config

// Error style (red X)
output.list(['Connection failed', 'Upload timeout'], { style: 'error' });
//   ✗ Connection failed
//   ✗ Upload timeout

// Custom indent
output.list(['Item 1', 'Item 2'], { indent: 4 });
```

### Key-Value Table

Display structured data as aligned key-value pairs:

```javascript
output.keyValue({
  Project: 'my-app',
  Branch: 'feature/login',
  Commit: 'abc1234',
  Environment: 'staging'
});
//   Project      my-app
//   Branch       feature/login
//   Commit       abc1234
//   Environment  staging

// Custom key width
output.keyValue({ Name: 'value' }, { keyWidth: 20 });
```

### Label-Value

Single key-value pair (inline):

```javascript
output.labelValue('Status', 'ready');
//   Status: ready

output.labelValue('Screenshots', '15');
//   Screenshots: 15
```

### Hint

Muted tips and additional information:

```javascript
output.hint('Use --verbose for more details');
//   Use --verbose for more details

output.hint('Dashboard: http://localhost:47392', { indent: 4 });
//     Dashboard: http://localhost:47392
```

### Link

Styled URLs with underline and info blue color:

```javascript
let url = output.link('Dashboard', 'http://localhost:47392');
// Returns: underlined blue URL

// Usage in output
output.labelValue('View', output.link('Dashboard', 'http://localhost:47392'));
//   View: http://localhost:47392 (underlined, blue)
```

### Complete

Success/completion message with checkmark:

```javascript
output.complete('Build uploaded');
//   ✓ Build uploaded

output.complete('Build uploaded', { detail: 'build-abc123' });
//   ✓ Build uploaded build-abc123
```

## Logging

### Success, Result, Error, Warn, Info

Standard logging functions with appropriate icons and colors:

```javascript
output.success('Configuration saved');
// ✓ Configuration saved

output.result('5 screenshots uploaded');  // Includes elapsed time
// ✓ 5 screenshots uploaded · 234ms

output.error('Upload failed', err);
// ✖ Upload failed
// Connection timeout (if err.message differs from message)

output.warn('Token expires in 24 hours');
// ⚠ Token expires in 24 hours

output.info('Processing started');
// ℹ Processing started
```

### Debug

Component-based debug logging (only shown when verbose):

```javascript
output.debug('server', 'listening on port', { port: 47392 });
//   server   listening on port port=47392

output.debug('config', 'loaded from file', { path: './vizzly.config.js' });
//   config   loaded from file path=./vizzly.config.js

output.debug('upload', 'batch complete', { uploaded: 5, total: 10 });
//   upload   batch complete uploaded=5 total=10
```

Component colors are mapped semantically:
- `server`, `baseline` - Success green (infrastructure)
- `tdd`, `compare` - Info blue (processing)
- `config`, `build`, `auth` - Warning amber (configuration)
- `upload`, `api` - Info blue (processing)
- `run` - Amber (primary action)

### Spinner

Animated loading indicator (only in TTY):

```javascript
output.startSpinner('Loading configuration...');
// ⠋ Loading configuration...  (animated)

output.updateSpinner('Processing', 5, 10);
// ⠙ Processing (5/10)

output.stopSpinner();
// Clears the spinner line
```

The spinner uses the amber brand color for the animation and plain text for the message.

### Progress

Progress updates that work with spinner or JSON mode:

```javascript
output.progress('Uploading screenshots', 3, 10);
// In TTY: updates spinner with (3/10)
// In JSON: outputs {"status":"progress","message":"...","progress":{"current":3,"total":10}}
```

## Colors

Access the colors object for custom formatting:

```javascript
let colors = output.getColors();

// Basic colors
colors.red('error text');
colors.green('success text');
colors.yellow('warning text');

// Brand colors (Observatory Design System)
colors.brand.amber('primary brand');        // #F59E0B
colors.brand.success('approved');           // #10B981
colors.brand.warning('pending');            // #F59E0B
colors.brand.danger('rejected');            // #EF4444
colors.brand.info('processing');            // #3B82F6

// Text hierarchy
colors.brand.textPrimary('heading');        // #FFFFFF
colors.brand.textSecondary('body');         // #9CA3AF
colors.brand.textTertiary('caption');       // #6B7280
colors.brand.textMuted('disabled');         // #4B5563

// Modifiers
colors.bold('important');
colors.dim('muted');
colors.underline('link');
colors.italic('emphasis');

// Backgrounds
colors.brand.bgSuccess(' PASS ');
colors.brand.bgWarning(' WARN ');
colors.brand.bgDanger(' FAIL ');
colors.brand.bgInfo(' INFO ');
```

## JSON Mode

All TUI helpers respect JSON mode. When `json: true`:
- Visual elements return empty strings or plain text
- Logging functions output structured JSON
- Spinners are disabled

```javascript
output.configure({ json: true });

output.success('Done');
// {"status":"success","message":"Done"}

output.error('Failed', new Error('Connection timeout'));
// {"status":"error","message":"Failed","error":{"name":"Error","message":"Connection timeout"}}

output.progress('Uploading', 5, 10);
// {"status":"progress","message":"Uploading","progress":{"current":5,"total":10}}
```

## Best Practices

### 1. Always configure at command start

```javascript
export async function myCommand(options, globalOptions) {
  output.configure({
    json: globalOptions.json,
    verbose: globalOptions.verbose,
    color: !globalOptions.noColor,
  });
  // ... rest of command
}
```

### 2. Use header for command branding

```javascript
output.header('upload', 'cloud');
```

### 3. Stop spinner before other output

```javascript
output.startSpinner('Processing...');
// ... async work ...
output.stopSpinner();  // Always stop before success/error
output.success('Done');
```

Most output functions call `stopSpinner()` automatically, but explicit stopping is clearer.

### 4. Use semantic functions for their purpose

```javascript
// Good
output.complete('Build ready');      // Completion state
output.success('Upload successful'); // Success message
output.result('5 screenshots');      // Final result with timing

// Avoid mixing purposes
```

### 5. Leverage debug for troubleshooting

```javascript
output.debug('api', 'request sent', { url, method });
output.debug('api', 'response received', { status, duration: '234ms' });
```

### 6. Clean up resources

```javascript
try {
  // ... command logic
} finally {
  output.cleanup();  // Stops spinner, flushes logs
}
```

## Examples

### Diagnostic Command

```javascript
export async function doctorCommand(options, globalOptions) {
  output.configure({ ... });
  output.header('doctor', 'full');

  let checks = [];

  // Run checks...
  checks.push({ name: 'Node.js', value: 'v20.10.0', ok: true });
  checks.push({ name: 'API', value: 'connected', ok: true });

  // Display results
  let colors = output.getColors();
  for (let check of checks) {
    let icon = check.ok ? colors.brand.success('✓') : colors.brand.danger('✗');
    let label = colors.brand.textTertiary(check.name.padEnd(12));
    output.print(`  ${icon} ${label} ${check.value}`);
  }

  output.blank();
  output.complete('Preflight passed');
}
```

### Upload Command

```javascript
export async function uploadCommand(path, options, globalOptions) {
  output.configure({ ... });
  output.header('upload', 'cloud');

  output.startSpinner('Uploading screenshots...');

  for (let i = 0; i < screenshots.length; i++) {
    output.progress('Uploading', i + 1, screenshots.length);
    await upload(screenshots[i]);
  }

  output.stopSpinner();

  output.keyValue({
    Build: buildId,
    Screenshots: String(screenshots.length),
    Branch: branch
  });

  output.blank();
  output.labelValue('View', output.link('Build', buildUrl));
  output.result(`${screenshots.length} screenshots uploaded`);
}
```

### TDD Dashboard

```javascript
output.printBox([
  `Dashboard: ${output.link('', dashboardUrl)}`,
  `Baselines: ${baselineCount} screenshots`
], { title: 'Ready', style: 'branded' });

output.blank();
output.hint('Press Ctrl+C to stop the server');
```

## Accessibility

The TUI toolkit is designed with accessibility in mind:

- **Color is not the only indicator** - Icons accompany colors (✓, ✗, ⚠, ℹ)
- **NO_COLOR support** - Respects `NO_COLOR` environment variable
- **Screen reader friendly** - Unicode characters are widely supported
- **High contrast** - Colors chosen for visibility on dark backgrounds

## Related Documentation

- [API Reference](./api-reference.md) - Complete CLI API documentation
- [Getting Started](./getting-started.md) - Quick start guide
- [Plugins](./plugins.md) - Creating plugins with TUI access
