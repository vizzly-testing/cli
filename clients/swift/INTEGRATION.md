# XCTest integration guide

The `VizzlyXCTest` product adds screenshot helpers to `XCUIApplication`,
`XCUIElement`, and `XCTestCase`. It supports iOS 13+ and macOS 10.15+ UI tests.

Start with [QUICKSTART.md](QUICKSTART.md) if you have not captured a local
screenshot yet.

## Connection discovery

`VizzlyClient` uses the first available screenshot server:

1. `VIZZLY_SERVER_URL`
2. Project-local `.vizzly/server.json`
3. User-level `.vizzly/server.json`
4. A live server on `http://localhost:47392`

`vizzly tdd start` writes the discovery file automatically. If the default port
is busy, use the dashboard URL printed by the command.

## Capture options

Capture the full app:

```swift
app.vizzlyScreenshot(
    name: "checkout",
    properties: [
        "theme": "dark",
        "account": "premium"
    ],
    threshold: 1.5,
    minClusterSize: 3,
    requestTimeout: 60_000
)
```

Capture one element:

```swift
app.buttons["Buy"].vizzlyScreenshot(name: "buy-button")
```

`threshold` is the CIEDE2000 Delta E threshold. `minClusterSize` ignores changed
pixel clusters smaller than the given count. Leave either value out to use the
server configuration.

Choose stable names. Add properties when the same screen has meaningful
variants such as device class, theme, or signed-in state.

## Stable screenshots

Wait for an observable UI state before capture:

```swift
let loaded = app.otherElements["ProfileLoaded"]
XCTAssertTrue(loaded.waitForExistence(timeout: 5))
app.vizzlyScreenshot(name: "profile")
```

Do not use a fixed sleep to guess when the screen is ready. Disable animations,
freeze dates, and seed test data when those values affect the pixels.

## Fail on local differences

Set either value before running the test:

```bash
VIZZLY_FAIL_ON_DIFF=true xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

`VIZZLY_FAIL_ON_DIFF=1` works too. You can also create a dedicated client with
an explicit setting:

```swift
let client = VizzlyClient(failOnDiff: true)
```

## Direct PNG uploads

Use the core `Vizzly` product when you already have PNG `Data` and do not need
XCTest helpers:

```swift
let client = VizzlyClient(serverUrl: "http://localhost:47392")

client.screenshot(
    name: "rendered-card",
    image: pngData,
    properties: ["platform": "iOS"]
)
```

## Cloud CI

Store `VIZZLY_TOKEN` as a CI secret, then wrap the real test command with
`vizzly run --wait`:

```yaml
- name: Run visual UI tests
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
  run: |
    pnpm exec vizzly run \
      "xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:MyAppUITests" \
      --wait
```

The CLI creates the cloud build, gives the Swift SDK its screenshot server and
build ID, waits for processing, and returns the review result to CI.

## Troubleshooting

### The test passes but no screenshot appears

- Run `pnpm exec vizzly tdd status`.
- Check that `.vizzly/server.json` exists under the project.
- Print `VizzlyClient.shared.info` from the test.
- Make sure the Mac or Simulator can reach the server URL.

The SDK skips screenshots after a connection failure so a local Vizzly outage
does not break unrelated UI tests.

### Local differences do not fail the test

Set `VIZZLY_FAIL_ON_DIFF=true`, or start TDD with its fail-on-diff option. Check
`VizzlyClient.shared.info["failOnDiff"]` to confirm the resolved setting.

### Screenshots are grouped incorrectly

Use a stable screenshot name and include device, theme, or state in
`properties`. Vizzly already includes platform and viewport metadata for the
XCTest helpers.
