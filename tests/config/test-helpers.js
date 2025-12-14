/**
 * Test helpers for config module tests
 *
 * Provides in-memory implementations for testing without mocks.
 */

/**
 * Create an in-memory global config store for testing
 * @param {Object} initialConfig - Initial config state
 * @param {string} configPath - Path to config file
 * @returns {Object} Config store with load, save, getPath methods
 */
export function createInMemoryGlobalConfigStore(
  initialConfig = {},
  configPath = '~/.vizzly/config.json'
) {
  let config = { ...initialConfig };

  return {
    async load() {
      return config;
    },
    async save(newConfig) {
      config = { ...newConfig };
    },
    getPath() {
      return configPath;
    },
    // Test helper to inspect current state
    _getState() {
      return config;
    },
    // Test helper to reset state
    _reset(newConfig = {}) {
      config = { ...newConfig };
    },
  };
}

/**
 * Create a mock cosmiconfig explorer for testing
 * @param {Object|null} searchResult - Result to return from search
 * @returns {Object} Explorer with search, clearCaches methods
 */
export function createMockExplorer(searchResult = null) {
  let cacheCleared = false;
  let searches = [];

  return {
    search(projectRoot) {
      searches.push(projectRoot);
      return searchResult;
    },
    clearCaches() {
      cacheCleared = true;
    },
    // Test helpers
    _wasCacheCleared() {
      return cacheCleared;
    },
    _getSearches() {
      return searches;
    },
    _resetCacheCleared() {
      cacheCleared = false;
    },
  };
}

/**
 * Create an in-memory file system for testing file operations
 * @param {Object} initialFiles - Map of filepath to content
 * @returns {Object} Object with readFile, writeFile, getFiles methods
 */
export function createInMemoryFs(initialFiles = {}) {
  let files = { ...initialFiles };
  let writes = [];

  async function readFile(filepath) {
    if (!(filepath in files)) {
      throw new Error(`ENOENT: no such file or directory, open '${filepath}'`);
    }
    return files[filepath];
  }

  async function writeFile(filepath, content) {
    files[filepath] = content;
    writes.push({ filepath, content });
  }

  return {
    readFile,
    writeFile,
    // Test helpers
    _getFiles() {
      return files;
    },
    _getWrites() {
      return writes;
    },
    _setFile(filepath, content) {
      files[filepath] = content;
    },
    _clear() {
      files = {};
      writes = [];
    },
  };
}

/**
 * Create a mock validator for testing
 * @param {Object} options - Validator options
 * @param {boolean} [options.shouldPass=true] - Whether validation should pass
 * @param {Error} [options.error] - Error to throw on failure
 * @returns {Function} Validator function
 */
export function createMockValidator(options = {}) {
  let { shouldPass = true, error = null } = options;
  let calls = [];

  function validate(config) {
    calls.push(config);

    if (!shouldPass) {
      throw (
        error || {
          message: 'Validation failed',
          errors: [{ message: 'Invalid config' }],
        }
      );
    }

    return config;
  }

  validate._getCalls = () => calls;
  validate._reset = () => {
    calls = [];
  };

  return validate;
}

/**
 * Create a complete set of config dependencies for testing
 * @param {Object} options - Options for creating dependencies
 * @returns {Object} Object with all dependencies for config operations
 */
export function createConfigDependencies(options = {}) {
  let {
    projectConfig = null,
    globalConfig = {},
    globalConfigPath = '~/.vizzly/config.json',
    projectRoot = '/test/project',
    files = {},
    validatorShouldPass = true,
    validatorError = null,
  } = options;

  let searchResult = projectConfig
    ? { config: projectConfig, filepath: `${projectRoot}/vizzly.config.js` }
    : null;

  let explorer = createMockExplorer(searchResult);
  let globalConfigStore = createInMemoryGlobalConfigStore(
    globalConfig,
    globalConfigPath
  );
  let fs = createInMemoryFs(files);
  let validate = createMockValidator({
    shouldPass: validatorShouldPass,
    error: validatorError,
  });

  return {
    explorer,
    globalConfigStore,
    projectRoot,
    writeFile: fs.writeFile,
    readFile: fs.readFile,
    validate,
    // Access to internals for assertions
    _fs: fs,
    _validate: validate,
  };
}
