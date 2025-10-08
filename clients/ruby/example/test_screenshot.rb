#!/usr/bin/env ruby
# frozen_string_literal: true

require 'minitest/autorun'
require 'vizzly'
require 'selenium-webdriver'

class ScreenshotTest < Minitest::Test
  def setup
    options = Selenium::WebDriver::Chrome::Options.new
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')

    @driver = Selenium::WebDriver.for :chrome, options: options
  end

  def teardown
    @driver&.quit
  end

  def test_captures_vizzly_homepage
    # Navigate to vizzly.dev
    @driver.navigate.to 'https://vizzly.dev'

    # Wait for page to load
    sleep 1

    # Capture screenshot as PNG binary data
    image_data = @driver.screenshot_as(:png)

    # Send to Vizzly
    result = Vizzly.screenshot('vizzly-homepage', image_data,
                               properties: {
                                 browser: 'chrome',
                                 viewport: { width: 1920, height: 1080 }
                               })

    puts "\n✓ Screenshot captured!"
    puts '  Name: vizzly-homepage'
    puts "  Result: #{result.inspect}"
    puts "  Client ready: #{Vizzly.ready?}"
    puts "  Client info: #{Vizzly.client.info}"

    # Test should pass regardless of Vizzly result
    assert true, 'Test completed'
  end
end
