# Vizzly Ruby client

Send screenshots from your Ruby tests to Vizzly to catch UI changes.

## Install

Add `gem 'vizzly'` to your Gemfile and run `bundle install`, or install directly:

```bash
gem install vizzly
```

## Capture a screenshot

Start `vizzly tdd start --open` for local review, then call the client from your
test:

```ruby
require 'vizzly'

Vizzly.screenshot('homepage', File.binread('screenshot.png'))
```

With RSpec and Capybara:

```ruby
RSpec.describe 'Homepage', type: :feature do
  it 'displays the homepage correctly' do
    visit '/'
    expect(page).to have_content('Welcome')

    Vizzly.screenshot('homepage', page.driver.browser.screenshot_as(:png))
  end
end
```

## Options

```ruby
Vizzly.screenshot('checkout', image_data,
  properties: { browser: 'chrome', theme: 'dark', locale: 'en-US' },
  threshold: 5,
  min_cluster_size: 3,
  full_page: true,
  build_id: 'build_123',
  request_timeout: 60_000
)
```

Options use snake_case. The camelCase aliases `minClusterSize`, `fullPage`,
`buildId`, and `requestTimeout` also work. Timeouts are in milliseconds:
`60_000` is one minute.

To make a client fail on local diffs:

```ruby
client = Vizzly::Client.new(fail_on_diff: true)
client.screenshot('login-form', image_data)
puts client.ready?
puts client.info
```

## Connection settings

The client looks for `.vizzly/server.json` in the current folder and its
parents to find your TDD server. You can also use these environment variables:

| Variable | What it does |
| --- | --- |
| `VIZZLY_SERVER_URL` | Set the server URL, such as `http://localhost:47392`. |
| `VIZZLY_BUILD_ID` | Group screenshots under a build ID. |
| `VIZZLY_FAIL_ON_DIFF` | Set `true` or `1` to raise on local visual diffs. |

## Development

```bash
ruby test/vizzly_test.rb
```

[Issues and PRs](https://github.com/vizzly-testing/cli) welcome. MIT licensed.
