export const ERROR_MESSAGES = {
  NO_API_TOKEN: {
    message: 'No API token provided',
    hint: 'Set the VIZZLY_TOKEN environment variable or pass --token flag',
    docs: 'https://github.com/vizzly-testing/cli#set-up-your-api-token',
  },

  BUILD_CREATION_FAILED: {
    message: 'Failed to create build',
    hint: 'Check your API token permissions and network connection',
    docs: 'https://github.com/vizzly-testing/cli/blob/main/docs/upload-command.md#troubleshooting',
  },

  NO_SCREENSHOTS_FOUND: {
    message: 'No screenshots found',
    hint: 'Make sure your test code calls vizzlyScreenshot() or check the screenshots directory',
    docs: 'https://github.com/vizzly-testing/cli/blob/main/docs/getting-started.md',
  },

  PORT_IN_USE: {
    message: 'Port is already in use',
    hint: 'Try a different port with --port flag or stop the process using this port',
    docs: 'https://github.com/vizzly-testing/cli/blob/main/docs/test-integration.md#troubleshooting',
  },
};

export function formatError(errorCode, context = {}) {
  const errorInfo = ERROR_MESSAGES[errorCode];
  if (!errorInfo) return { message: errorCode };

  return {
    message: errorInfo.message,
    hint: errorInfo.hint,
    docs: errorInfo.docs,
    context,
  };
}
