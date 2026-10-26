# XCTest integration guide

`VizzlyXCTest` adds screenshot helpers to `XCUIApplication`, `XCUIElement`,
and `XCTestCase` for iOS 13+ and macOS 10.15+ UI tests. If you haven't taken a
screenshot yet, start with the [quick start](QUICKSTART.md).

## Connect to Vizzly

`VizzlyClient` looks for a screenshot server in this order:

1. `VIZZLY_SERVER_URL`
2. Project-local `.vizzly/server.json`
3. User-level `.vizzly/server.json`
4. A live server on `http://localhost:47392`

`vizzly tdd start` writes `.vizzly/server.json` for you. If the default port
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

`threshold` sets the CIEDE2000 Delta E sensitivity. `minClusterSize` ignores
groups of changed pixels smaller than that count. Leave either option out to
use the server setting.

Use the same name for the same screen across runs. Add properties for things
like device, theme, or sign-in state.

## Keep screenshots consistent

Wait for the content you need before taking the screenshot:

```swift
let loaded = app.otherElements["ProfileLoaded"]
XCTAssertTrue(loaded.waitForExistence(timeout: 5))
app.vizzlyScreenshot(name: "profile")
```

Wait for the UI instead of adding a fixed sleep. If animations, dates, or test
data change the screenshot, keep them consistent between runs.

## Fail on local differences

Set `VIZZLY_FAIL_ON_DIFF` before running the test:

```bash
VIZZLY_FAIL_ON_DIFF=true xcodebuild test \
  -scheme MyApp \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

`VIZZLY_FAIL_ON_DIFF=1` works too. Or set it on a separate client:

```swift
let client = VizzlyClient(failOnDiff: true)
```

## Direct PNG uploads

If you already have PNG `Data`, send it with the core `Vizzly` product:

```swift
let client = VizzlyClient(serverUrl: "http://localhost:47392")

client.screenshot(
    name: "rendered-card",
    image: pngData,
    properties: ["platform": "iOS"]
)
```

## Cloud CI

Save `VIZZLY_TOKEN` as a CI secret, then run your tests through
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

Vizzly creates a cloud build, connects the Swift SDK, and waits for results.
CI gets the review result when the command finishes.

## Troubleshooting

### The test passes but no screenshot appears

- Run `pnpm exec vizzly tdd status`.
- Check that `.vizzly/server.json` exists under the project.
- Print `VizzlyClient.shared.info` from the test.
- Make sure the Mac or Simulator can reach the server URL.

If Vizzly can't connect, the SDK skips screenshots so your other UI tests can
keep running.

### Local differences don't fail the test

Set `VIZZLY_FAIL_ON_DIFF=true` or start TDD with `--fail-on-diff`. Check
`VizzlyClient.shared.info["failOnDiff"]` to see which setting is in use.

### Screenshots are grouped incorrectly

Keep screenshot names consistent and put device, theme, or state in
`properties`. The XCTest helpers already include platform and viewport details.
