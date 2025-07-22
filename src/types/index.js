/**
 * @fileoverview Vizzly CLI type definitions
 * Comprehensive JSDoc type definitions for IDE support
 */

/**
 * @typedef {Object} VizzlyConfig
 * @property {string} [apiKey] - API key for authentication
 * @property {string} [apiUrl='https://vizzly.dev'] - API base URL
 * @property {ServerConfig} [server] - Server configuration
 * @property {BuildConfig} [build] - Build configuration
 * @property {UploadConfig} [upload] - Upload configuration
 * @property {ComparisonConfig} [comparison] - Comparison configuration
 */

/**
 * @typedef {Object} ServerConfig
 * @property {number} [port=3001] - Server port
 * @property {string} [host='localhost'] - Server host
 * @property {boolean} [https=false] - Use HTTPS
 * @property {string} [certPath] - Path to SSL certificate
 * @property {string} [keyPath] - Path to SSL key
 * @property {string} [screenshotPath='/screenshot'] - Screenshot POST endpoint path
 */

/**
 * @typedef {Object} BuildConfig
 * @property {string} [name] - Build name
 * @property {string} [branch] - Git branch
 * @property {string} [commit] - Git commit SHA
 * @property {string} [message] - Commit message
 * @property {string} [environment='production'] - Environment name
 * @property {Object.<string, any>} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} UploadConfig
 * @property {string} [screenshotsDir='screenshots'] - Directory containing screenshots
 * @property {number} [batchSize=50] - Upload batch size
 * @property {number} [timeout=300000] - Upload timeout in ms
 * @property {number} [retries=3] - Number of retries
 * @property {boolean} [deduplication=true] - Enable deduplication
 */

/**
 * @typedef {Object} ComparisonConfig
 * @property {number} [threshold=0.1] - Default comparison threshold (0-1)
 * @property {boolean} [ignoreAntialiasing=true] - Ignore antialiasing differences
 * @property {boolean} [ignoreColors=false] - Ignore color differences
 * @property {string} [diffColor='#ff0000'] - Color for diff highlighting
 */

/**
 * @typedef {Object} Screenshot
 * @property {string} name - Screenshot name
 * @property {Buffer} image - Image buffer data
 * @property {Object.<string, any>} [properties] - Additional properties
 * @property {number} [threshold] - Comparison threshold override
 * @property {string} [group] - Screenshot group/category
 * @property {string[]} [tags] - Screenshot tags
 */

/**
 * @typedef {Object} UploadOptions
 * @property {string} screenshotsDir - Directory containing screenshots
 * @property {string} [buildName] - Name for this build
 * @property {string} [branch] - Git branch name
 * @property {string} [commit] - Git commit SHA
 * @property {string} [message] - Commit message
 * @property {string} [environment='production'] - Environment name
 * @property {number} [threshold] - Default comparison threshold
 * @property {ProgressCallback} [onProgress] - Progress callback
 */

/**
 * @typedef {Object} UploadResult
 * @property {boolean} success - Whether upload succeeded
 * @property {string} [buildId] - Build ID if successful
 * @property {string} [url] - Build URL if available
 * @property {UploadStats} stats - Upload statistics
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} UploadStats
 * @property {number} total - Total files found
 * @property {number} uploaded - Files uploaded
 * @property {number} skipped - Files skipped (duplicates)
 * @property {number} failed - Files failed to upload
 */

/**
 * @typedef {Object} ProgressEvent
 * @property {'scanning'|'processing'|'deduplication'|'uploading'|'completed'|'error'} phase - Current phase
 * @property {number} [current] - Current item being processed
 * @property {number} [total] - Total items to process
 * @property {string} [message] - Progress message
 * @property {number} [toUpload] - Files to upload (deduplication phase)
 * @property {number} [existing] - Existing files (deduplication phase)
 * @property {string} [buildId] - Build ID (completed phase)
 * @property {string} [url] - Build URL (completed phase)
 */

/**
 * @callback ProgressCallback
 * @param {ProgressEvent} event - Progress event
 * @returns {void}
 */

/**
 * @typedef {Object} TDDOptions
 * @property {string} [baselineDir='baseline'] - Baseline screenshots directory
 * @property {string} [currentDir='screenshots'] - Current screenshots directory
 * @property {string} [diffDir='diffs'] - Diff output directory
 * @property {number} [threshold=0.1] - Comparison threshold
 * @property {boolean} [failOnDifference=true] - Fail on any difference
 * @property {boolean} [updateBaseline=false] - Update baseline on difference
 */

/**
 * @typedef {Object} ComparisonResult
 * @property {string} name - Screenshot name
 * @property {boolean} passed - Whether comparison passed
 * @property {number} [difference] - Difference percentage (0-1)
 * @property {string} [diffPath] - Path to diff image
 * @property {string} [error] - Error message if comparison failed
 */

/**
 * @typedef {Object} BuildInfo
 * @property {string} id - Build ID
 * @property {string} name - Build name
 * @property {'pending'|'processing'|'completed'|'failed'} status - Build status
 * @property {string} branch - Git branch
 * @property {string} [commit] - Git commit SHA
 * @property {string} environment - Environment name
 * @property {Date} createdAt - Creation timestamp
 * @property {Date} [completedAt] - Completion timestamp
 * @property {number} screenshotCount - Number of screenshots
 * @property {Object.<string, any>} [metadata] - Additional metadata
 */

/**
 * @typedef {Object} CLIOptions
 * @property {boolean} [verbose=false] - Enable verbose logging
 * @property {string} [logLevel='info'] - Log level
 * @property {boolean} [quiet=false] - Suppress all output
 * @property {boolean} [json=false] - Output JSON instead of text
 * @property {string} [config] - Path to config file
 */

// Export types for use in other files
export default {};
