/**
 * Base error class for all Vizzly errors
 * Provides consistent error structure and helpful debugging information
 */
export class VizzlyError extends Error {
  constructor(message, code = 'VIZZLY_ERROR', context = {}) {
    super(message);
    this.name = 'VizzlyError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage() {
    return this.message;
  }

  /**
   * Get error details for logging
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends VizzlyError {
  constructor(message, context = {}) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }

  getUserMessage() {
    return `Configuration error: ${this.message}. Please check your vizzly.config.js file.`;
  }
}

/**
 * Authentication/authorization errors
 */
export class AuthError extends VizzlyError {
  constructor(message, context = {}) {
    super(message, 'AUTH_ERROR', context);
    this.name = 'AuthError';
  }

  getUserMessage() {
    return `Authentication error: ${this.message}. Please check your VIZZLY_TOKEN.`;
  }
}

/**
 * Network/connection errors
 */
export class NetworkError extends VizzlyError {
  constructor(message, context = {}) {
    super(message, 'NETWORK_ERROR', context);
    this.name = 'NetworkError';
  }

  getUserMessage() {
    return `Network error: ${this.message}. Please check your connection.`;
  }
}

/**
 * Upload-related errors
 */
export class UploadError extends VizzlyError {
  constructor(message, context = {}) {
    super(message, 'UPLOAD_ERROR', context);
    this.name = 'UploadError';
  }

  getUserMessage() {
    return `Upload failed: ${this.message}`;
  }
}

/**
 * Screenshot-related errors
 */
export class ScreenshotError extends VizzlyError {
  constructor(message, context = {}) {
    super(message, 'SCREENSHOT_ERROR', context);
    this.name = 'ScreenshotError';
  }

  getUserMessage() {
    return `Screenshot error: ${this.message}`;
  }
}

/**
 * Build-related errors
 */
export class BuildError extends VizzlyError {
  constructor(message, context = {}) {
    super(message, 'BUILD_ERROR', context);
    this.name = 'BuildError';
  }

  getUserMessage() {
    return `Build error: ${this.message}`;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends VizzlyError {
  constructor(message, duration, context = {}) {
    super(message, 'TIMEOUT_ERROR', { duration, ...context });
    this.name = 'TimeoutError';
    this.duration = duration;
  }

  getUserMessage() {
    return `Operation timed out after ${this.duration}ms: ${this.message}`;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends VizzlyError {
  constructor(message, errors = [], context = {}) {
    super(message, 'VALIDATION_ERROR', { errors, ...context });
    this.name = 'ValidationError';
    this.errors = errors;
  }

  getUserMessage() {
    if (this.errors.length > 0) {
      return `${this.message}: ${this.errors.join(', ')}`;
    }
    return this.message;
  }
}
