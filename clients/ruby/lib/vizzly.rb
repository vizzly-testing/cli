# frozen_string_literal: true

require 'net/http'
require 'json'
require 'base64'

# Vizzly visual regression testing client
module Vizzly
  class Error < StandardError; end

  # Default port for local TDD server
  DEFAULT_TDD_PORT = 47392

  class Client
    attr_reader :server_url, :disabled

    def initialize(server_url: nil, fail_on_diff: nil)
      @server_info = nil
      @configured_fail_on_diff = fail_on_diff
      @server_url = server_url || discover_server_url
      @disabled = ENV['VIZZLY_ENABLED'] == 'false'
      @warned = false
    end

    # Take a screenshot for visual regression testing
    #
    # @param name [String] Unique name for the screenshot
    # @param image_data [String] PNG image data as binary string
    # @param options [Hash] Optional configuration
    # @option options [Hash] :properties Additional properties to attach
    # @option options [Numeric] :threshold Delta E comparison threshold. When
    #   omitted, the server's configured threshold is used.
    # @option options [Integer] :min_cluster_size Ignore connected diff
    #   clusters smaller than this size. When omitted, the server config is used.
    # @option options [Boolean] :full_page Whether this is a full page screenshot
    # @option options [String] :build_id Build ID for grouping screenshots
    # @option options [Numeric] :request_timeout Request timeout in milliseconds
    #
    # @return [Hash, nil] Response data or nil if disabled/failed
    #
    # @example
    #   client = Vizzly::Client.new
    #   image_data = File.binread('screenshot.png')
    #   client.screenshot('homepage', image_data)
    #
    # @example With options
    #   client.screenshot('checkout', image_data,
    #     properties: { browser: 'chrome', viewport: { width: 1920, height: 1080 } },
    #     threshold: 5
    #   )
    # rubocop:disable Metrics/AbcSize, Metrics/MethodLength
    def screenshot(name, image_data, options = {})
      return nil if disabled?

      unless @server_url
        warn_once('Vizzly client not initialized. Screenshots will be skipped.')
        disable!
        return nil
      end

      image_base64 = Base64.strict_encode64(image_data)
      options = normalize_options(options)
      normalized = normalize_screenshot_options(options)

      normalized[:warnings].each { |warning| warn warning[:message] }

      request_timeout = normalized[:request_timeout]
      request_timeout_seconds = request_timeout ? request_timeout.to_f / 1000.0 : 30
      build_id = normalized[:build_id] || ENV.fetch('VIZZLY_BUILD_ID', nil)

      payload = {
        name: name,
        image: image_base64,
        type: 'base64',
        buildId: build_id,
        properties: normalized[:properties],
        warnings: normalized[:warnings]
      }.compact

      uri = URI("#{@server_url}/screenshot")

      begin
        response = Net::HTTP.start(
          uri.host,
          uri.port,
          use_ssl: uri.scheme == 'https',
          open_timeout: 10,
          read_timeout: request_timeout_seconds
        ) do |http|
          request = Net::HTTP::Post.new(uri)
          request['Content-Type'] = 'application/json'
          request.body = JSON.generate(payload)
          http.request(request)
        end

        unless response.is_a?(Net::HTTPSuccess)
          error_data = begin
            JSON.parse(response.body)
          rescue JSON::ParserError, StandardError
            {}
          end

          # In TDD mode with visual differences, log but don't raise
          if response.code == '422' && error_data['tddMode'] && error_data['comparison']
            comp = error_data['comparison']
            diff_percent = comp['diffPercentage']&.round(2) || 0.0

            if fail_on_diff?
              raise Error,
                    "Visual diff detected for \"#{comp['name'] || name}\" (#{comp['diffPercentage'] || 0}% difference)"
            end

            # Extract port from server_url
            port = begin
              @server_url.match(/:(\d+)/)[1]
            rescue StandardError
              DEFAULT_TDD_PORT.to_s
            end
            dashboard_url = "http://localhost:#{port}/dashboard"

            warn "⚠️  Visual diff: #{comp['name']} (#{diff_percent}%) → #{dashboard_url}"

            return {
              success: true,
              status: 'failed',
              name: comp['name'],
              diffPercentage: comp['diffPercentage']
            }
          end

          raise Error,
                "Screenshot failed: #{response.code} #{response.message} - #{error_data['error'] || 'Unknown error'}"
        end

        body = JSON.parse(response.body)
        if body['tddMode'] && %w[diff failed].include?(body['status']) && fail_on_diff?
          raise Error,
                "Visual diff detected for \"#{body['name'] || name}\" (#{body['diffPercentage'] || 0}% difference)"
        end

        body
      rescue Error => e
        # Re-raise Vizzly errors (like visual diffs)
        raise if e.message.include?('Visual diff')

        warn "Vizzly screenshot failed for #{name}: #{e.message}"

        if e.message.include?('Connection refused') || e.is_a?(Errno::ECONNREFUSED)
          warn "Server URL: #{@server_url}/screenshot"
          warn 'This usually means the Vizzly server is not running or not accessible'
          warn 'Check that the server is started and the port is correct'
        elsif e.message.include?('404') || e.message.include?('Not Found')
          warn "Server URL: #{@server_url}/screenshot"
          warn 'The screenshot endpoint was not found - check server configuration'
        end

        # Disable the SDK after first failure to prevent spam
        disable!('failure')

        nil
      rescue Net::OpenTimeout
        warn "Vizzly connection timed out for #{name}: couldn't connect within 10s"
        warn "Server URL: #{@server_url}/screenshot"
        warn 'This usually means the server is unreachable (firewall, network issue, or wrong host)'
        disable!('failure')
        nil
      rescue Net::ReadTimeout
        warn "Vizzly request timed out for #{name}: no response within 30s"
        warn "Server URL: #{@server_url}/screenshot"
        warn 'The server may be overloaded or processing is taking too long'
        disable!('failure')
        nil
      rescue StandardError => e
        warn "Vizzly screenshot failed for #{name}: #{e.message}"
        disable!('failure')
        nil
      end
    end
    # rubocop:enable Metrics/AbcSize, Metrics/MethodLength

    # Wait for all queued screenshots to be processed
    # (Simple client doesn't need explicit flushing)
    #
    # @return [true]
    def flush
      true
    end

    # Check if the client is ready to capture screenshots
    #
    # @return [Boolean]
    def ready?
      !disabled? && !@server_url.nil?
    end

    # Disable screenshot capture
    #
    # @param reason [String] Optional reason for disabling
    def disable!(reason = 'disabled')
      @disabled = true
      return if reason == 'disabled'

      warn "Vizzly SDK disabled due to #{reason}. Screenshots will be skipped for the remainder of this session."
    end

    # Check if screenshot capture is disabled
    #
    # @return [Boolean]
    def disabled?
      @disabled
    end

    # Get client information
    #
    # @return [Hash] Client state information
    def info
      {
        enabled: !disabled?,
        server_url: @server_url,
        serverUrl: @server_url,
        ready: ready?,
        build_id: ENV.fetch('VIZZLY_BUILD_ID', nil),
        buildId: ENV.fetch('VIZZLY_BUILD_ID', nil),
        disabled: disabled?,
        fail_on_diff: fail_on_diff?,
        failOnDiff: fail_on_diff?
      }
    end

    private

    def normalize_options(options)
      options.each_with_object({}) do |(key, value), normalized|
        normalized[key.is_a?(String) ? key.to_sym : key] = value
      end
    end

    def option_value(options, *keys)
      keys.each do |key|
        return options[key] if options.key?(key)
      end

      nil
    end

    def normalize_screenshot_options(options)
      threshold = options[:threshold]
      min_cluster_size = option_value(options, :min_cluster_size, :minClusterSize)
      full_page = options.key?(:full_page) ? options[:full_page] : options[:fullPage]
      build_id = option_value(options, :build_id, :buildId)
      request_timeout = option_value(options, :request_timeout, :requestTimeout)
      properties = {}
      warnings = []

      (options[:properties] || {}).each do |key, value|
        option = key.to_s
        case option
        when 'threshold'
          threshold = value if threshold.nil?
        when 'min_cluster_size', 'minClusterSize'
          min_cluster_size = value if min_cluster_size.nil?
        when 'full_page', 'fullPage'
          full_page = value if full_page.nil?
        when 'build_id', 'buildId'
          build_id = value if build_id.nil?
        when 'request_timeout', 'requestTimeout'
          request_timeout = value if request_timeout.nil?
        else
          properties[key] = value
          next
        end

        warnings << reserved_property_warning(option)
      end

      properties = properties.merge(
        threshold: threshold,
        minClusterSize: min_cluster_size,
        fullPage: full_page
      ).compact

      {
        build_id: build_id,
        request_timeout: request_timeout,
        properties: properties,
        warnings: warnings
      }
    end

    def reserved_property_warning(option)
      {
        code: 'reserved-property-option',
        option: option,
        message: "Move \"#{option}\" out of properties; properties is only for user metadata."
      }
    end

    def warn_once(message)
      return if @warned

      warn message
      @warned = true
    end

    # Discover Vizzly server URL from environment or auto-discovery
    def discover_server_url
      # First check environment variable
      return ENV['VIZZLY_SERVER_URL'] if ENV['VIZZLY_SERVER_URL']

      # Then try auto-discovery
      auto_discover_tdd_server
    end

    def fail_on_diff?
      return @configured_fail_on_diff unless @configured_fail_on_diff.nil?

      env_value = ENV.fetch('VIZZLY_FAIL_ON_DIFF', '').downcase
      return true if %w[true 1].include?(env_value)

      @server_info && @server_info['failOnDiff'] == true
    end

    # Auto-discover local TDD server by checking for server.json
    def auto_discover_tdd_server
      dir = Dir.pwd
      root = File.expand_path('/')

      until dir == root
        server_json_path = File.join(dir, '.vizzly', 'server.json')

        if File.exist?(server_json_path)
          begin
            server_info = JSON.parse(File.read(server_json_path))
            @server_info = server_info
            port = server_info['port'] || DEFAULT_TDD_PORT
            return "http://localhost:#{port}"
          rescue JSON::ParserError, Errno::ENOENT
            # Invalid JSON or file disappeared, continue searching
          end
        end

        dir = File.dirname(dir)
      end

      nil
    end
  end

  class << self
    # Get or create the shared client instance
    #
    # @return [Client]
    def client
      @client ||= Client.new
    end

    # Take a screenshot using the shared client
    #
    # @see Client#screenshot
    def screenshot(name, image_data, options = {})
      client.screenshot(name, image_data, options)
    end

    # Flush the shared client
    #
    # @see Client#flush
    def flush
      client.flush
    end

    # Check if the shared client is ready
    #
    # @see Client#ready?
    def ready?
      client.ready?
    end

    # Reset the shared client (useful for testing)
    def reset!
      @client = nil
    end
  end
end
