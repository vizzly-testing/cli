# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name = 'vizzly'
  spec.version = '0.2.1'
  spec.authors = ['Vizzly']
  spec.email = ['support@vizzly.dev']

  spec.summary = 'Vizzly visual regression testing client for Ruby'
  spec.description = 'A lightweight client SDK for capturing screenshots and sending them to Vizzly for visual ' \
                     'regression testing'
  spec.homepage = 'https://github.com/vizzly-testing/cli'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.0.0'

  spec.metadata['homepage_uri'] = spec.homepage
  spec.metadata['source_code_uri'] = 'https://github.com/vizzly-testing/cli'
  spec.metadata['changelog_uri'] = 'https://github.com/vizzly-testing/cli/blob/main/clients/ruby/CHANGELOG.md'
  spec.metadata['rubygems_mfa_required'] = 'true'

  spec.files = Dir['lib/**/*', 'README.md', 'LICENSE']
  spec.require_paths = ['lib']

  # No runtime dependencies - uses only Ruby stdlib
end
