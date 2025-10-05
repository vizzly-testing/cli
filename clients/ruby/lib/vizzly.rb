# frozen_string_literal: true

require 'net/http'
require 'json'
require 'base64'

# Vizzly visual regression testing client
module Vizzly
  class Error < StandardError; end

  class Client
    attr_reader :server_url, :disabled

    def initialize(server_url: nil)
      @server_url = server_url || discover_server_url
      @disabled = false
      @warned = false
    end

    # Take a screenshot for visual regression testing
    #
    # @param name [String] Unique name for the screenshot
    # @param image_data [String] PNG image data as binary string
    # @param options [Hash] Optional configuration
    # @option options [Hash] :properties Additional properties to attach
    # @option options [Integer] :threshold Pixel difference threshold (0-100)
    # @option options [Boolean] :full_page Whether this is a full page screenshot
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
    def screenshot(name, image_data, options = {})
      return nil if disabled?

      unless @server_url
        warn_once('Vizzly client not initialized. Screenshots will be skipped.')
        disable!
        return nil
      end

      image_base64 = Base64.strict_encode64(image_data)

      payload = {
        name: name,
        image: image_base64,
        buildId: ENV.fetch('VIZZLY_BUILD_ID', nil),
        threshold: options[:threshold] || 0,
        fullPage: options[:full_page] || false,
        properties: options[:properties] || {}
      }.compact

      uri = URI("#{@server_url}/screenshot")
      http = Net::HTTP.new(uri.host, uri.port)
      http.read_timeout = 30

      request = Net::HTTP::Post.new(uri)
      request['Content-Type'] = 'application/json'
      request.body = JSON.generate(payload)

      begin
        response = http.request(request)

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

            # Extract port from server_url
            port = begin
              @server_url.match(/:(\d+)/)[1]
            rescue StandardError
              '47392'
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

        JSON.parse(response.body)
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
      rescue StandardError => e
        warn "Vizzly screenshot failed for #{name}: #{e.message}"
        disable!('failure')
        nil
      end
    end

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
        ready: ready?,
        build_id: ENV.fetch('VIZZLY_BUILD_ID', nil),
        disabled: disabled?
      }
    end

    private

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

    # Auto-discover local TDD server by checking for server.json
    def auto_discover_tdd_server
      dir = Dir.pwd
      root = File.expand_path('/')

      until dir == root
        server_json_path = File.join(dir, '.vizzly', 'server.json')

        if File.exist?(server_json_path)
          begin
            server_info = JSON.parse(File.read(server_json_path))
            return "http://localhost:#{server_info['port']}" if server_info['port']
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
