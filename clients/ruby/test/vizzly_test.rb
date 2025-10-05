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
    File.write('.vizzly/server.json', JSON.generate({ port: 47392 }))

    client = Vizzly::Client.new
    assert_equal 'http://localhost:47392', client.server_url
  end

  def test_auto_discovery_in_parent_directory
    # Create .vizzly/server.json in temp dir
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47392 }))

    # Create subdirectory and change to it
    FileUtils.mkdir_p('subdir')
    Dir.chdir('subdir')

    client = Vizzly::Client.new
    assert_equal 'http://localhost:47392', client.server_url
  end

  def test_environment_variable_takes_precedence
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47392 }))

    ENV['VIZZLY_SERVER_URL'] = 'http://localhost:9999'

    client = Vizzly::Client.new
    assert_equal 'http://localhost:9999', client.server_url
  ensure
    ENV.delete('VIZZLY_SERVER_URL')
  end

  def test_ready_when_server_url_available
    FileUtils.mkdir_p('.vizzly')
    File.write('.vizzly/server.json', JSON.generate({ port: 47392 }))

    client = Vizzly::Client.new
    assert client.ready?
  end

  def test_not_ready_without_server_url
    client = Vizzly::Client.new
    refute client.ready?
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
end
