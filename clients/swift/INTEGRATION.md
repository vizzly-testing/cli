# XCTest integration guide

`VizzlyXCTest` adds screenshot helpers to `XCUIApplication`, `XCUIElement`,
and `XCTestCase` for iOS 13+ and macOS 10.15+ UI tests. If you haven't taken a
screenshot yet, start with the [quick start](QUICKSTART.md).

## Connect to Vizzly

`VizzlyClient` looks for a screenshot server in this order:

1. `VIZZLY_SERVER_URL`
2. `.vizzly/server.json` in the test runner's current folder
3. `$HOME/.vizzly/server.json`
4. A live server on `http://localhost:47392`

`vizzly tdd start` writes `.vizzly/server.json` in your project. An iOS test
runner may have a different current folder and home directory. For a custom
port, set `VIZZLY_SERVER_URL` in the test runner's environment to the printed
server URL; don't rely on it finding the project file.

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

## Check local differences in XCTest

With `failOnDiff` enabled, `screenshot()` returns `nil` and disables further
captures after a local visual diff. It doesn't fail XCTest by itself. Assert
on the result if you want that:

```swift
let client = VizzlyClient(failOnDiff: true)
let result = client.screenshot(
    name: "checkout",
    image: app.screenshot().pngRepresentation
)
XCTAssertNotNil(result, "Vizzly capture failed or found a visual difference")
```

Connection and upload errors also return `nil`, so this assertion fails for
those too. To enable the setting for `VizzlyClient.shared`, put
`VIZZLY_FAIL_ON_DIFF=true` or `1` in the test runner's environment, or use the
setting from its discovered TDD server file. The screenshot helpers use the
shared client; creating another client doesn't change their settings.

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

Save `VIZZLY_TOKEN` as a CI secret. `vizzly run` creates a cloud build and gives
its child command `VIZZLY_SERVER_URL` and `VIZZLY_BUILD_ID`. Your Xcode test
plan or launcher must pass those values to the UI test runner, where the SDK
runs. The CLI doesn't configure that forwarding for you.

Once your runner receives both values, wrap the test command:

```yaml
- name: Run visual UI tests
  env:
    VIZZLY_TOKEN: ${{ secrets.VIZZLY_TOKEN }}
  run: |
    pnpm exec vizzly run \
      "xcodebuild test -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:MyAppUITests"
```

Check `VizzlyClient.shared.info` in the runner to confirm the server URL and
build ID. Wrapping `xcodebuild` alone hasn't been verified to deliver them to
an iOS UI test runner. See [CI checks](../../README.md#run-in-ci) to make cloud
visual differences fail the CI job.

## Troubleshooting

### The test passes but no screenshot appears

- Run `pnpm exec vizzly tdd status`.
- Check that `.vizzly/server.json` exists under the project.
- Print `VizzlyClient.shared.info` from the test.
- Make sure the Mac or Simulator can reach the server URL.

If Vizzly can't connect, the SDK skips screenshots so your other UI tests can
keep running.

### Local differences don't fail the test

Check `VizzlyClient.shared.info["failOnDiff"]` and assert on the screenshot
result as shown above. Enabling the setting alone doesn't fail XCTest.

### Screenshots are grouped incorrectly

Keep screenshot names consistent. For separate local baselines by device,
theme, or state, list those keys in the top-level `signatureProperties` config
and send their values in `properties`. For cloud builds, configure the matching
properties in your Vizzly project settings. Extra metadata alone doesn't create
separate baselines.

App captures include platform and viewport details. Element captures include
platform and element type; Vizzly reads image dimensions from the PNG.
