# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'fileutils'
require 'tmpdir'
require_relative '../lib/vizzly'

class VizzlyTest < Minitest::Test
  def setup
    Vizzly.reset!
    @original_dir = Dir.pwd
    @temp_dir = Dir.mktmpdir
    Dir.chdir(@temp_dir)
  end

  def teardown
    Dir.chdir(@original_dir)
    FileUtils.rm_rf(@temp_dir)
  end

  def test_auto_discovery
    # Create .vizzly/server.json
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47_392 }))

    client = Vizzly::Client.new
    assert_equal 'http://localhost:47392', client.server_url
  end

  def test_auto_discovery_in_parent_directory
    # Create .vizzly/server.json in temp dir
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47_392 }))

    # Create subdirectory and change to it
    FileUtils.mkdir_p('subdir')
    Dir.chdir('subdir')

    client = Vizzly::Client.new
    assert_equal 'http://localhost:47392', client.server_url
  end

  def test_environment_variable_takes_precedence
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47_392 }))

    ENV['VIZZLY_SERVER_URL'] = 'http://localhost:9999'

    client = Vizzly::Client.new
    assert_equal 'http://localhost:9999', client.server_url
  ensure
    ENV.delete('VIZZLY_SERVER_URL')
  end

  def test_ready_when_server_url_available
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47_392 }))

    client = Vizzly::Client.new
    assert client.ready?
  end

  def test_not_ready_without_server_url
    client = Vizzly::Client.new
    refute client.ready?
  end

  def test_disabled_by_environment
    ENV['VIZZLY_ENABLED'] = 'false'
    ENV['VIZZLY_SERVER_URL'] = 'http://localhost:47392'

    client = Vizzly::Client.new
    refute client.ready?
    assert_nil client.screenshot('test', 'fake_image_data')
  ensure
    ENV.delete('VIZZLY_ENABLED')
    ENV.delete('VIZZLY_SERVER_URL')
  end

  def test_disabled_after_disable
    client = Vizzly::Client.new
    refute client.disabled?

    client.disable!
    assert client.disabled?
  end

  def test_screenshot_returns_nil_when_no_server
    client = Vizzly::Client.new
    result = client.screenshot('test', 'fake_image_data')
    assert_nil result
  end

  def test_info_returns_hash
    client = Vizzly::Client.new
    info = client.info

    assert_kind_of Hash, info
    assert_includes info, :enabled
    assert_includes info, :server_url
    assert_includes info, :ready
    assert_includes info, :build_id
    assert_includes info, :disabled
    assert_includes info, :fail_on_diff
    assert_includes info, :failOnDiff
  end

  def test_info_exposes_configured_fail_on_diff
    enabled_client = Vizzly::Client.new(fail_on_diff: true)
    disabled_client = Vizzly::Client.new(fail_on_diff: false)

    assert_equal true, enabled_client.info[:fail_on_diff]
    assert_equal true, enabled_client.info[:failOnDiff]
    assert_equal false, disabled_client.info[:fail_on_diff]
    assert_equal false, disabled_client.info[:failOnDiff]
  end

  def test_info_exposes_environment_fail_on_diff
    ENV['VIZZLY_FAIL_ON_DIFF'] = '1'

    client = Vizzly::Client.new

    assert_equal true, client.info[:fail_on_diff]
    assert_equal true, client.info[:failOnDiff]
  ensure
    ENV.delete('VIZZLY_FAIL_ON_DIFF')
  end

  def test_module_level_screenshot
    # Should not raise even without server
    result = Vizzly.screenshot('test', 'fake_data')
    assert_nil result
  end

  def test_module_level_ready
    refute Vizzly.ready?
  end

  def test_flush
    client = Vizzly::Client.new
    assert client.flush
    assert Vizzly.flush
  end

  def test_fail_on_diff_raises_for_current_tdd_response_shape
    original_start = Net::HTTP.method(:start)
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response_body = JSON.generate(
      success: true,
      tddMode: true,
      status: 'diff',
      name: 'homepage',
      diffPercentage: 5.2
    )
    response.define_singleton_method(:body) { response_body }
    Net::HTTP.define_singleton_method(:start) do |_host, _port, **_options|
      response
    end
    ENV['VIZZLY_FAIL_ON_DIFF'] = 'true'

    client = Vizzly::Client.new(
      server_url: 'http://localhost:47392'
    )
    assert_raises(Vizzly::Error) do
      client.screenshot('homepage', 'fake_image_data')
    end
  ensure
    ENV.delete('VIZZLY_FAIL_ON_DIFF')
    Net::HTTP.define_singleton_method(:start, original_start)
  end

  def test_fail_on_diff_raises_for_legacy_422_tdd_response_shape
    original_start = Net::HTTP.method(:start)
    response = Net::HTTPUnprocessableEntity.new('1.1', '422', 'Unprocessable Entity')
    response_body = JSON.generate(
      tddMode: true,
      comparison: {
        name: 'homepage',
        diffPercentage: 5.2
      }
    )
    response.define_singleton_method(:body) { response_body }
    Net::HTTP.define_singleton_method(:start) do |_host, _port, **_options|
      response
    end
    ENV['VIZZLY_FAIL_ON_DIFF'] = 'true'

    client = Vizzly::Client.new(
      server_url: 'http://localhost:47392'
    )
    assert_raises(Vizzly::Error) do
      client.screenshot('homepage', 'fake_image_data')
    end
  ensure
    ENV.delete('VIZZLY_FAIL_ON_DIFF')
    Net::HTTP.define_singleton_method(:start, original_start)
  end

  def test_server_json_fail_on_diff_raises_for_current_tdd_response_shape
    FileUtils.mkdir_p('.vizzly')
    File.write(
      '.vizzly/server.json',
      JSON.generate({ port: 47_392, failOnDiff: true })
    )

    original_start = Net::HTTP.method(:start)
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response_body = JSON.generate(
      success: true,
      tddMode: true,
      status: 'diff',
      name: 'homepage',
      diffPercentage: 5.2
    )
    response.define_singleton_method(:body) { response_body }
    Net::HTTP.define_singleton_method(:start) do |_host, _port, **_options|
      response
    end

    client = Vizzly::Client.new
    assert_raises(Vizzly::Error) do
      client.screenshot('homepage', 'fake_image_data')
    end
  ensure
    Net::HTTP.define_singleton_method(:start, original_start)
  end

  def test_screenshot_serializes_fractional_threshold_in_properties
    captured_body = nil
    original_start = Net::HTTP.method(:start)
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response.define_singleton_method(:body) { JSON.generate(status: 'match') }
    fake_http = Object.new
    fake_http.define_singleton_method(:request) do |request|
      captured_body = JSON.parse(request.body)
      response
    end
    Net::HTTP.define_singleton_method(:start) do |_host, _port, **_options, &block|
      block.call(fake_http)
    end

    client = Vizzly::Client.new(server_url: 'http://localhost:47392')
    result = client.screenshot(
      'fractional-threshold',
      'fake_image_data',
      threshold: 1.5
    )

    assert_equal 'match', result['status']
    assert_equal 1.5, captured_body['properties']['threshold']
    refute_includes captured_body, 'threshold'
  ensure
    Net::HTTP.define_singleton_method(:start, original_start)
  end

  def test_screenshot_serializes_browser_and_nested_viewport_properties
    captured_body = nil
    original_start = Net::HTTP.method(:start)
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response.define_singleton_method(:body) { JSON.generate(status: 'match') }
    fake_http = Object.new
    fake_http.define_singleton_method(:request) do |request|
      captured_body = JSON.parse(request.body)
      response
    end
    Net::HTTP.define_singleton_method(:start) do |_host, _port, **_options, &block|
      block.call(fake_http)
    end

    client = Vizzly::Client.new(server_url: 'http://localhost:47392')
    result = client.screenshot(
      'responsive-homepage',
      'fake_image_data',
      properties: {
        browser: 'chrome',
        viewport: { width: 1920, height: 1080 }
      }
    )

    assert_equal 'match', result['status']
    assert_equal 'chrome', captured_body['properties']['browser']
    assert_equal 1920, captured_body['properties']['viewport']['width']
    assert_equal 1080, captured_body['properties']['viewport']['height']
    ensure
      Net::HTTP.define_singleton_method(:start, original_start)
  end

  def test_screenshot_accepts_string_keys_and_preserves_zero_values
    captured_body = nil
    captured_options = nil
    original_start = Net::HTTP.method(:start)
    response = Net::HTTPOK.new('1.1', '200', 'OK')
    response.define_singleton_method(:body) { JSON.generate(status: 'match') }
    fake_http = Object.new
    fake_http.define_singleton_method(:request) do |request|
      captured_body = JSON.parse(request.body)
      response
    end
    Net::HTTP.define_singleton_method(:start) do |_host, _port, **options, &block|
      captured_options = options
      block.call(fake_http)
    end

    client = Vizzly::Client.new(server_url: 'http://localhost:47392')
    result = client.screenshot(
      'string-key-options',
      'fake_image_data',
      'buildId' => 'build-from-call',
      'requestTimeout' => 0,
      'minClusterSize' => 0,
      'properties' => {
        'browser' => 'chrome',
        'viewport' => { 'width' => 1920, 'height' => 1080 }
      }
    )

    assert_equal 'match', result['status']
    assert_equal 0, captured_options[:read_timeout]
    assert_equal 'build-from-call', captured_body['buildId']

    properties = captured_body['properties']
    assert_equal 'chrome', properties['browser']
    assert_equal 0, properties['minClusterSize']
    assert_equal 1920, properties['viewport']['width']
    assert_equal 1080, properties['viewport']['height']
    refute_includes properties, 'buildId'
  ensure
    Net::HTTP.define_singleton_method(:start, original_start)
  end
end
