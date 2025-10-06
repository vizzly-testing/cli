# Vizzly Ruby Client

A lightweight Ruby client SDK for capturing screenshots and sending them to Vizzly for visual
regression testing.

## Installation

Add this line to your application's Gemfile:

```ruby
gem 'vizzly'
```

And then execute:

```bash
bundle install
```

Or install it yourself as:

```bash
gem install vizzly
```

## Usage

### Basic Usage

```ruby
require 'vizzly'

# Take a screenshot
image_data = File.binread('screenshot.png')
Vizzly.screenshot('homepage', image_data)
```

### With Options

```ruby
Vizzly.screenshot('checkout-page', image_data,
  properties: {
    browser: 'chrome',
    viewport: { width: 1920, height: 1080 }
  },
  threshold: 5
)
```

### Using a Client Instance

```ruby
client = Vizzly::Client.new
client.screenshot('login-form', image_data)

# Check if client is ready
puts "Ready: #{client.ready?}"

# Get client info
puts client.info
```

### Integration with Test Frameworks

#### RSpec + Capybara

```ruby
RSpec.describe 'Homepage', type: :feature do
  it 'displays the homepage correctly' do
    visit '/'
    expect(page).to have_content('Welcome')

    # Take a screenshot for visual regression testing
    image_data = page.driver.browser.screenshot_as(:png)
    Vizzly.screenshot('homepage', image_data)
  end

  it 'displays the checkout page' do
    visit '/checkout'
    fill_in 'Email', with: 'test@example.com'

    # Take a screenshot with properties
    image_data = page.driver.browser.screenshot_as(:png)
    Vizzly.screenshot('checkout-form', image_data,
      properties: {
        browser: 'chrome',
        viewport: { width: 1920, height: 1080 }
      }
    )
  end
end
```

## Configuration

The client automatically discovers a running Vizzly TDD server by looking for `.vizzly/server.json`
in the current and parent directories.

You can also configure via environment variables:

- `VIZZLY_SERVER_URL` - Server URL (e.g., `http://localhost:47392`)
- `VIZZLY_BUILD_ID` - Build identifier for grouping screenshots

## Development

After checking out the repo, run tests:

```bash
ruby test/vizzly_test.rb
```

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/vizzly-testing/vizzly-cli.

## License

The gem is available as open source under the terms of the MIT License.
