# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'fileutils'
require 'tmpdir'
require 'open3'
require_relative '../lib/vizzly'

# Integration test that requires a running Vizzly server
# Run with: VIZZLY_INTEGRATION=1 ruby test/integration_test.rb
class IntegrationTest < Minitest::Test
  def setup
    skip 'Set VIZZLY_INTEGRATION=1 to run integration tests' unless ENV['VIZZLY_INTEGRATION']

    @original_dir = Dir.pwd
    @temp_dir = Dir.mktmpdir
    Dir.chdir(@temp_dir)
    Vizzly.reset!

    # Ensure we have a Vizzly CLI available
    @vizzly_cli = find_vizzly_cli
    skip 'Vizzly CLI not found' unless @vizzly_cli
  end

  def teardown
    stop_server if @server_pid
    Dir.chdir(@original_dir)
    FileUtils.rm_rf(@temp_dir)
  end

  def test_screenshot_with_running_server
    start_server

    # Create a simple PNG (1x1 red pixel)
    image_data = create_test_png

    # Take a screenshot
    result = Vizzly.screenshot('test-screenshot', image_data,
                               properties: { browser: 'chrome', viewport: { width: 1920, height: 1080 } })

    assert result, 'Expected result to be non-nil'
    # TDD mode returns status: 'new' for first screenshot, 'match' for subsequent
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  def test_screenshot_with_auto_discovery
    start_server

    # Verify server.json was created
    assert File.exist?('.vizzly/server.json')

    # Create new client (should auto-discover)
    client = Vizzly::Client.new
    assert client.ready?
    assert_match(/localhost:\d+/, client.server_url)

    image_data = create_test_png
    result = client.screenshot('auto-discovered', image_data)

    assert result, 'Expected result to be non-nil'
    # TDD mode returns status: 'new' for first screenshot, 'match' for subsequent
    assert %w[new match].include?(result['status']), "Expected status 'new' or 'match', got: #{result['status']}"
  end

  private

  def find_vizzly_cli
    # Try to find vizzly CLI in parent directories
    cli_path = File.expand_path('../../../dist/cli.js', __dir__)
    return nil unless File.exist?(cli_path)

    "node #{cli_path}"
  end

  def start_server
    # Start vizzly tdd in background (it daemonizes itself)
    success = system("#{@vizzly_cli} tdd start > /dev/null 2>&1")

    raise 'Failed to execute vizzly tdd start' unless success

    # Wait for server to be ready
    30.times do
      break if File.exist?('.vizzly/server.json')

      sleep 0.1
    end

    unless File.exist?('.vizzly/server.json')
      # Try to read error log if it exists
      error_log = File.join('.vizzly', 'daemon-error.log')
      puts "Error log: #{File.read(error_log)}" if File.exist?(error_log)
      raise 'Server failed to start'
    end

    @server_pid = true # Flag that server is running
  end

  def stop_server
    return unless @server_pid

    system("#{@vizzly_cli} tdd stop")
    @server_pid = nil
  end

  # Create a minimal valid PNG (1x1 red pixel)
  def create_test_png
    [
      137, 80, 78, 71, 13, 10, 26, 10, # PNG signature
      0, 0, 0, 13, 73, 72, 68, 82, # IHDR chunk
      0, 0, 0, 1, 0, 0, 0, 1, # 1x1 dimensions
      8, 2, 0, 0, 0, 144, 119, 83, 222, # bit depth, color type, etc
      0, 0, 0, 12, 73, 68, 65, 84, # IDAT chunk
      8, 215, 99, 248, 207, 192, 0, 0, 3, 1, 1, 0, # compressed data
      24, 221, 141, 176, # CRC
      0, 0, 0, 0, 73, 69, 78, 68, # IEND chunk
      174, 66, 96, 130 # CRC
    ].pack('C*')
  end
end
