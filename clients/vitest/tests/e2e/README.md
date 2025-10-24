# E2E Integration Tests

These tests verify the Vitest plugin integration with Vizzly and serve as real-world examples for users.

## Running E2E Tests

### Local TDD Mode (Recommended for Development)

```bash
# Start TDD server in one terminal
npx vizzly tdd start

# Run tests in another terminal (or in watch mode)
npm run test:e2e
```

This provides:
- Real-time visual feedback at http://localhost:47392/dashboard
- Local baseline management in `.vizzly/baselines/`
- Fast iteration cycle

### Cloud Mode (Used in CI)

```bash
# Run tests with Vizzly cloud upload
npx vizzly run "npm run test:e2e"
```

This:
- Uploads screenshots to Vizzly cloud
- Allows team review and collaboration
- Used automatically in CI/CD pipelines

## CI/CD

The CI workflow runs both unit tests and E2E tests:

1. **Unit tests** - Test plugin configuration (runs in Node environment)
2. **E2E tests** - Test actual browser integration wrapped with `vizzly run` (uploads to cloud)

The E2E tests in CI use Vizzly cloud mode to:
- Verify the integration works end-to-end
- Provide visual regression testing for the SDK itself
- Serve as living documentation

## Test Structure

The example tests demonstrate:
- Basic screenshot comparison with `toMatchScreenshot()`
- Using custom properties for better screenshot organization
- Integration with Vitest's browser mode and Playwright
