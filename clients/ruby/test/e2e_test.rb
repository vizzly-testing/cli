# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'fileutils'
require 'tmpdir'
require 'webrick'
require_relative '../lib/vizzly'

# Helper methods for E2E test setup and teardown
module E2ETestHelpers
  def find_vizzly_cli
    path = File.expand_path('../../../dist/cli.js', __dir__)
    return nil unless File.exist?(path)

    path
  end

  def cli_path
    @cli_path ||= find_vizzly_cli
  end

  def find_test_site
    test_site_path = File.expand_path('../../../test-site', __dir__)
    return nil unless File.exist?(File.join(test_site_path, 'index.html'))

    test_site_path
  end

  def start_test_site_server
    @test_site_port = rand(3030..4029)
    @test_site_url = "http://localhost:#{@test_site_port}"

    @test_site_server = WEBrick::HTTPServer.new(
      Port: @test_site_port,
      DocumentRoot: @test_site_path,
      Logger: WEBrick::Log.new(File::NULL),
      AccessLog: []
    )

    @test_site_thread = Thread.new { @test_site_server.start }
    sleep 0.5
  end

  def stop_test_site_server
    @test_site_server&.shutdown
    @test_site_thread&.join(2)
  end

  def start_vizzly_server
    return if @external_server

    pid = spawn('node', cli_path, 'tdd', 'start', %i[out err] => File::NULL)
    _pid, status = Process.wait2(pid)
    raise 'Failed to start Vizzly TDD server' unless status.success?

    30.times do
      break if File.exist?('.vizzly/server.json')

      sleep 0.1
    end

    raise 'Vizzly server failed to start' unless File.exist?('.vizzly/server.json')
  end

  def stop_vizzly_server
    return if @external_server

    pid = spawn('node', cli_path, 'tdd', 'stop', %i[out err] => File::NULL)
    Process.wait(pid)
  end

  def setup_selenium
    options = Selenium::WebDriver::Chrome::Options.new
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--window-size=1920,1080')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')

    @driver = Selenium::WebDriver.for :chrome, options: options
  end

  def wait_for_page_load
    wait = Selenium::WebDriver::Wait.new(timeout: 10)
    wait.until { @driver.find_element(tag_name: 'body') }
    sleep 0.3
  end

  def capture_screenshot(name, options = {})
    image_data = @driver.screenshot_as(:png)
    Vizzly.screenshot(name, image_data, options)
  end

  def capture_element_screenshot(name, element, options = {})
    @driver.execute_script('arguments[0].scrollIntoView(true);', element)
    sleep 0.1

    image_data = element.screenshot_as(:png)
    Vizzly.screenshot(name, image_data, options)
  end

  def assert_screenshot_result(result)
    assert result, 'Expected screenshot result to be non-nil'
    assert %w[new match].include?(result['status']),
           "Expected status 'new' or 'match', got: #{result['status']}"
  end
end

# E2E test using the shared test-site (FluffyCloud)
# Run with: VIZZLY_E2E=1 ruby test/e2e_test.rb
#
# When run via `vizzly tdd run`, VIZZLY_SERVER_URL is set and we use that server.
# When run standalone, we start our own server.
#
# Requires:
# - Selenium WebDriver gem: gem install selenium-webdriver
# - Chrome/Chromium browser
# - ChromeDriver in PATH
#
# This test captures real browser screenshots from the shared test-site
# to ensure consistency with other SDK E2E tests.
class E2ETest < Minitest::Test
  include E2ETestHelpers

  def setup
    skip 'Set VIZZLY_E2E=1 to run E2E tests' unless ENV['VIZZLY_E2E']

    begin
      require 'selenium-webdriver'
    rescue LoadError
      skip 'selenium-webdriver gem not installed (gem install selenium-webdriver)'
    end

    @original_dir = Dir.pwd
    Vizzly.reset!

    # Check if we're running under `vizzly tdd run` or `vizzly run`
    @external_server = !ENV['VIZZLY_SERVER_URL'].nil?

    if @external_server
      # Running under vizzly wrapper - server is already running
      @temp_dir = nil
    else
      # Running standalone - create temp dir and start our own server
      @temp_dir = Dir.mktmpdir
      Dir.chdir(@temp_dir)
      skip 'Vizzly CLI not found' unless cli_path
    end

    @test_site_path = find_test_site
    skip 'test-site not found' unless @test_site_path

    # Start test site server
    start_test_site_server

    # Start Vizzly TDD server (only if not using external)
    start_vizzly_server

    # Setup Selenium
    setup_selenium
  end

  def teardown
    @driver&.quit
    stop_vizzly_server
    stop_test_site_server
    return unless @temp_dir

    Dir.chdir(@original_dir) if @original_dir
    FileUtils.rm_rf(@temp_dir)
  end

  # ===========================================================================
  # Homepage Tests
  # ===========================================================================

  def test_homepage_full_page
    @driver.navigate.to "#{@test_site_url}/index.html"
    wait_for_page_load

    result = capture_screenshot('homepage-full', full_page: true)
    assert_screenshot_result(result)
  end

  def test_homepage_navigation
    @driver.navigate.to "#{@test_site_url}/index.html"
    wait_for_page_load

    nav = @driver.find_element(tag_name: 'nav')
    result = capture_element_screenshot('homepage-nav', nav)
    assert_screenshot_result(result)
  end

  def test_homepage_hero_section
    @driver.navigate.to "#{@test_site_url}/index.html"
    wait_for_page_load

    hero = @driver.find_element(tag_name: 'section')
    result = capture_element_screenshot('homepage-hero', hero,
                                        properties: { section: 'hero', page: 'homepage' })
    assert_screenshot_result(result)
  end

  # ===========================================================================
  # Multiple Pages
  # ===========================================================================

  def test_features_page
    @driver.navigate.to "#{@test_site_url}/features.html"
    wait_for_page_load

    result = capture_screenshot('features-full', full_page: true)
    assert_screenshot_result(result)
  end

  def test_pricing_page
    @driver.navigate.to "#{@test_site_url}/pricing.html"
    wait_for_page_load

    result = capture_screenshot('pricing-full', full_page: true)
    assert_screenshot_result(result)
  end

  def test_contact_page
    @driver.navigate.to "#{@test_site_url}/contact.html"
    wait_for_page_load

    result = capture_screenshot('contact-full', full_page: true)
    assert_screenshot_result(result)
  end

  # ===========================================================================
  # Options Testing
  # ===========================================================================

  def test_screenshot_with_threshold
    @driver.navigate.to "#{@test_site_url}/index.html"
    wait_for_page_load

    nav = @driver.find_element(tag_name: 'nav')
    result = capture_element_screenshot('threshold-test', nav, threshold: 5)
    assert_screenshot_result(result)
  end

  def test_screenshot_with_properties
    @driver.navigate.to "#{@test_site_url}/index.html"
    wait_for_page_load

    result = capture_screenshot('props-test',
                                properties: {
                                  browser: 'chrome',
                                  viewport: { width: 1920, height: 1080 },
                                  theme: 'light'
                                })
    assert_screenshot_result(result)
  end

  def test_screenshot_with_all_options
    @driver.navigate.to "#{@test_site_url}/index.html"
    wait_for_page_load

    result = capture_screenshot('all-options-test',
                                full_page: true,
                                threshold: 3,
                                properties: {
                                  browser: 'chrome',
                                  page: 'homepage',
                                  test_type: 'comprehensive'
                                })
    assert_screenshot_result(result)
  end

  # ===========================================================================
  # Multiple Screenshots
  # ===========================================================================

  def test_navigation_across_pages
    pages = %w[index.html features.html pricing.html contact.html]

    pages.each_with_index do |page, index|
      @driver.navigate.to "#{@test_site_url}/#{page}"
      wait_for_page_load

      nav = @driver.find_element(tag_name: 'nav')
      result = capture_element_screenshot("nav-page-#{index}", nav,
                                          properties: { page: page })
      assert_screenshot_result(result)
    end
  end
end
