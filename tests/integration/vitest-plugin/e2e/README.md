# Vitest Plugin E2E Tests

This directory contains end-to-end tests for the @vizzly-testing/vitest package.

## Running the E2E Tests

These tests demonstrate the plugin working with real Vitest browser mode tests.

### Prerequisites

```bash
# Install dependencies
cd tests/integration/vitest-plugin/e2e
npm install
```

### Run with TDD Mode

Terminal 1 - Start Vizzly TDD server:
```bash
npx vizzly dev start
```

Terminal 2 - Run tests:
```bash
npx vitest
```

Visit http://localhost:47392/dashboard to see the results.

### Run with Cloud Mode

```bash
npx vizzly run "npx vitest" --wait
```

## Test Files

- **example.test.js** - Contains two test cases:
  - Basic screenshot test
  - Screenshot with properties (multi-variant testing)

## What Gets Tested

1. **Plugin Configuration** - Vitest loads and applies the vizzlyPlugin
2. **Screenshot Comparator** - Vitest uses the vizzly comparator for toMatchScreenshot
3. **Baseline Creation** - First run creates baselines in `.vizzly/baselines/`
4. **Comparison** - Subsequent runs compare against baselines
5. **Properties** - Custom properties are properly passed through comparatorOptions
6. **TDD Dashboard** - Results appear in the live dashboard
7. **Path Resolution** - Screenshots stored in `.vizzly/baselines/` not `__screenshots__/`

## Expected Results

- First run: All tests pass (baselines created)
- Second run: All tests pass (no visual changes)
- Check `.vizzly/baselines/` - should contain PNG files
- Check dashboard - should show comparison results
