# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'fileutils'
require 'tmpdir'
require 'open3'
require_relative '../lib/vizzly'

# Helper methods for integration test setup and server management
module IntegrationTestHelpers
  def find_vizzly_cli
    path = File.expand_path('../../../dist/cli.js', __dir__)
    return nil unless File.exist?(path)

    path
  end

  def cli_path
    @cli_path ||= find_vizzly_cli
  end

  def start_server
    return if @external_server

    pid = spawn('node', cli_path, 'tdd', 'start', %i[out err] => File::NULL)
    _pid, status = Process.wait2(pid)
    raise 'Failed to execute vizzly tdd start' unless status.success?

    30.times do
      break if File.exist?('.vizzly/server.json')

      sleep 0.1
    end

    unless File.exist?('.vizzly/server.json')
      error_log = File.join('.vizzly', 'daemon-error.log')
      puts "Error log: #{File.read(error_log)}" if File.exist?(error_log)
      raise 'Server failed to start'
    end

    @server_pid = true
  end

  def stop_server
    return unless @server_pid
    return if @external_server

    pid = spawn('node', cli_path, 'tdd', 'stop', %i[out err] => File::NULL)
    Process.wait(pid)
    @server_pid = nil
  end

  # Create a minimal valid PNG (1x1 red pixel)
  def create_test_png
    [
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 13, 73, 72, 68, 82,
      0, 0, 0, 1, 0, 0, 0, 1,
      8, 2, 0, 0, 0, 144, 119, 83, 222,
      0, 0, 0, 12, 73, 68, 65, 84,
      8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0,
      24, 221, 141, 176,
      0, 0, 0, 0, 73, 69, 78, 68,
      174, 66, 96, 130
    ].pack('C*')
  end
end

# Integration test that requires a running Vizzly server
# Run with: VIZZLY_INTEGRATION=1 ruby test/integration_test.rb
#
# When run via `vizzly tdd run`, VIZZLY_SERVER_URL is set and we use that server.
# When run standalone, we start our own server.
#
# These tests use a minimal PNG for fast execution. For browser-based tests
# with the shared test-site, see example/test_screenshot.rb
class IntegrationTest < Minitest::Test
  include IntegrationTestHelpers

  def setup
    skip 'Set VIZZLY_INTEGRATION=1 to run integration tests' unless ENV['VIZZLY_INTEGRATION']

    @original_dir = Dir.pwd
    Vizzly.reset!

    # Check if we're running under `vizzly tdd run` or `vizzly run`
    @external_server = !ENV['VIZZLY_SERVER_URL'].nil?

    if @external_server
      # Running under vizzly wrapper - server is already running
      # Stay in current directory (where server.json exists)
      @temp_dir = nil
    else
      # Running standalone - create temp dir and start our own server
      @temp_dir = Dir.mktmpdir
      Dir.chdir(@temp_dir)
      skip 'Vizzly CLI not found' unless cli_path
    end
  end

  def teardown
    stop_server if @server_pid
    return unless @temp_dir

    Dir.chdir(@original_dir)
    FileUtils.rm_rf(@temp_dir)
  end

  # ===========================================================================
  # Basic Screenshot Capture
  # ===========================================================================

  def test_basic_screenshot
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('basic-screenshot', image_data)

    assert result, 'Expected result to be non-nil'
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  def test_screenshot_with_properties
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('screenshot-with-props', image_data,
                               properties: {
                                 browser: 'chrome',
                                 viewport: { width: 1920, height: 1080 },
                                 theme: 'light'
                               })

    assert result, 'Expected result to be non-nil'
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  def test_screenshot_with_threshold
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('screenshot-threshold', image_data, threshold: 5)

    assert result, 'Expected result to be non-nil'
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  def test_screenshot_with_full_page
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('screenshot-fullpage', image_data, full_page: true)

    assert result, 'Expected result to be non-nil'
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  def test_screenshot_with_all_options
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('screenshot-all-options', image_data,
                               properties: {
                                 browser: 'firefox',
                                 viewport: { width: 1280, height: 720 },
                                 component: 'hero'
                               },
                               threshold: 3,
                               full_page: false)

    assert result, 'Expected result to be non-nil'
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  # ===========================================================================
  # Auto-Discovery
  # ===========================================================================

  def test_auto_discovery_via_server_json
    # Skip when running under vizzly wrapper (server.json is in different directory)
    skip 'Skipped under vizzly tdd run (uses external server)' if @external_server

    start_server

    # Verify server.json was created
    assert File.exist?('.vizzly/server.json'), 'server.json should be created'

    # Create new client (should auto-discover)
    client = Vizzly::Client.new
    assert client.ready?, 'Client should be ready after auto-discovery'
    assert_match(/localhost:\d+/, client.server_url)

    image_data = create_test_png
    result = client.screenshot('auto-discovered', image_data)

    assert result, 'Expected result to be non-nil'
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  # ===========================================================================
  # Client Configuration
  # ===========================================================================

  def test_explicit_server_url
    # Skip when running under vizzly wrapper (server.json is in different directory)
    skip 'Skipped under vizzly tdd run (uses external server)' if @external_server

    start_server

    # Read port from server.json
    server_info = JSON.parse(File.read('.vizzly/server.json'))
    port = server_info['port']

    client = Vizzly::Client.new(server_url: "http://localhost:#{port}")
    assert client.ready?, 'Client with explicit URL should be ready'
    assert_equal "http://localhost:#{port}", client.server_url

    image_data = create_test_png
    result = client.screenshot('explicit-url', image_data)

    assert result, 'Expected result to be non-nil'
  end

  def test_client_info
    start_server

    client = Vizzly::Client.new
    info = client.info

    assert_equal true, info[:enabled]
    assert_equal true, info[:ready]
    assert_equal false, info[:disabled]
    assert_match(/localhost:\d+/, info[:server_url])
  end

  def test_client_ready_state
    start_server

    client = Vizzly::Client.new
    assert client.ready?, 'Client should be ready with running server'
    refute client.disabled?, 'Client should not be disabled'
  end

  # ===========================================================================
  # Multiple Screenshots
  # ===========================================================================

  def test_multiple_screenshots_sequence
    start_server
    image_data = create_test_png

    # Capture multiple screenshots in sequence
    result1 = Vizzly.screenshot('sequence-1', image_data, properties: { index: 1 })
    result2 = Vizzly.screenshot('sequence-2', image_data, properties: { index: 2 })
    result3 = Vizzly.screenshot('sequence-3', image_data, properties: { index: 3 })

    assert result1, 'First screenshot should succeed'
    assert result2, 'Second screenshot should succeed'
    assert result3, 'Third screenshot should succeed'
  end

  # ===========================================================================
  # Singleton Client
  # ===========================================================================

  def test_singleton_client
    start_server
    image_data = create_test_png

    # Use module-level methods (singleton)
    assert Vizzly.ready?, 'Singleton client should be ready'

    result = Vizzly.screenshot('singleton-test', image_data)
    assert result, 'Screenshot via singleton should succeed'

    Vizzly.flush # Should complete without error
  end

  # ===========================================================================
  # Edge Cases
  # ===========================================================================

  def test_empty_properties
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('empty-props', image_data, properties: {})

    assert result, 'Screenshot with empty properties should succeed'
  end

  def test_zero_threshold
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('zero-threshold', image_data, threshold: 0)

    assert result, 'Screenshot with zero threshold should succeed'
  end

  def test_special_characters_in_name
    start_server
    image_data = create_test_png

    result = Vizzly.screenshot('screenshot_with-special.chars', image_data)

    assert result, 'Screenshot with special characters in name should succeed'
  end
end
