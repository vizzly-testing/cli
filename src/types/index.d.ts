/**
 * Vizzly CLI Type Definitions
 * @module @vizzly-testing/cli
 */

import { EventEmitter } from 'node:events';

// ============================================================================
// Configuration Types
// ============================================================================

export interface ServerConfig {
  port?: number;
  timeout?: number;
}

export interface BuildConfig {
  name?: string;
  environment?: string;
  branch?: string;
  commit?: string;
  message?: string;
}

export interface UploadConfig {
  screenshotsDir?: string | string[];
  /** Batch size used when uploading screenshots. */
  batchSize?: number;
  /** Timeout in milliseconds for waiting on build processing after upload. */
  timeout?: number;
}

export interface ComparisonConfig {
  /** CIEDE2000 Delta E threshold (0=exact, 1=JND, 2=recommended default) */
  threshold?: number;
  /**
   * Minimum cluster size to count as a real difference.
   * Filters out scattered single-pixel noise from rendering variance.
   * - 1 = Exact matching (any different pixel counts)
   * - 2 = Default (filters single isolated pixels as noise)
   * - 3+ = More permissive (only larger clusters detected)
   * @default 2
   */
  minClusterSize?: number;
}

export interface TddConfig {
  openReport?: boolean;
}

export interface VizzlyConfig {
  apiKey?: string;
  apiUrl?: string;
  server?: ServerConfig;
  build?: BuildConfig;
  upload?: UploadConfig;
  comparison?: ComparisonConfig;
  tdd?: TddConfig;
  /** Custom properties for baseline matching (e.g., ['theme', 'device']) */
  signatureProperties?: string[];
  plugins?: string[];
  parallelId?: string;
  baselineBuildId?: string;
  baselineComparisonId?: string;
  eager?: boolean;
  wait?: boolean;
  allowNoToken?: boolean;
  /** Allow additional plugin-specific configuration */
  [key: string]: unknown;
}

// ============================================================================
// Screenshot Types
// ============================================================================

export interface ScreenshotOptions {
  properties?: Record<string, unknown>;
  threshold?: number;
  minClusterSize?: number;
  fullPage?: boolean;
  /** Transport-only build ID used to route the request. */
  buildId?: string;
  /** Client-side HTTP timeout in milliseconds; not stored as metadata. */
  requestTimeout?: number;
  [key: string]: unknown;
}

export interface ScreenshotResult {
  success: boolean;
  status?:
    | 'passed'
    | 'failed'
    | 'new'
    | 'match'
    | 'diff'
    | 'baseline-updated'
    | 'error';
  name?: string;
  diffPercentage?: number;
  [key: string]: unknown;
}

// ============================================================================
// Comparison Types
// ============================================================================

export interface ComparisonResult {
  id: string;
  name: string;
  status:
    | 'passed'
    | 'failed'
    | 'new'
    | 'error'
    | 'baseline-created'
    | 'baseline-updated';
  baseline: string;
  current: string;
  diff: string | null;
  properties: Record<string, unknown>;
  signature: string;
  threshold?: number;
  minClusterSize?: number;
  diffPercentage?: number;
  diffCount?: number;
  error?: string;
}

export interface TddResults {
  total: number;
  passed: number;
  failed: number;
  new: number;
  errors: number;
  comparisons: ComparisonResult[];
  baseline: BaselineData | null;
}

export interface BaselineData {
  buildId: string;
  buildName: string;
  environment?: string;
  branch?: string;
  threshold: number;
  createdAt?: string;
  screenshots: BaselineScreenshot[];
}

export interface BaselineScreenshot {
  name: string;
  originalName?: string;
  sha256?: string;
  id?: string;
  properties: Record<string, unknown>;
  path: string;
  signature: string;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface UploadOptions {
  screenshotsDir?: string;
  buildName?: string;
  branch?: string;
  commit?: string;
  message?: string;
  environment?: string;
  threshold?: number;
  minClusterSize?: number;
  metadata?: Record<string, unknown>;
  pullRequestNumber?: string | number;
  parallelId?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface UploadProgress {
  phase:
    | 'scanning'
    | 'processing'
    | 'deduplication'
    | 'uploading'
    | 'completed';
  message: string;
  total?: number;
  current?: number;
  toUpload?: number;
  existing?: number;
  buildId?: string;
  url?: string;
}

export interface UploadResult {
  success: boolean;
  buildId: string;
  url: string | null;
  stats: {
    total: number;
    uploaded: number;
    skipped: number;
  };
}

export interface BuildResult {
  status: 'completed' | 'failed' | 'pending';
  build: unknown;
  comparisons?: number;
  totalComparisons: number;
  passedComparisons?: number;
  failedComparisons?: number;
  newComparisons: number;
  url?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class VizzlyError extends Error {
  code: string;
  context: Record<string, unknown>;
  timestamp: string;
  constructor(
    message: string,
    code?: string,
    context?: Record<string, unknown>
  );
  getUserMessage(): string;
  toJSON(): {
    name: string;
    code: string;
    message: string;
    context: Record<string, unknown>;
    timestamp: string;
    stack?: string;
  };
}

export class ConfigError extends VizzlyError {
  constructor(message: string, context?: Record<string, unknown>);
}

export class AuthError extends VizzlyError {
  constructor(message: string, context?: Record<string, unknown>);
}

export class NetworkError extends VizzlyError {
  constructor(message: string, context?: Record<string, unknown>);
}

export class UploadError extends VizzlyError {
  constructor(message: string, context?: Record<string, unknown>);
}

export class ScreenshotError extends VizzlyError {
  constructor(message: string, context?: Record<string, unknown>);
}

export class BuildError extends VizzlyError {
  constructor(message: string, context?: Record<string, unknown>);
}

export class TimeoutError extends VizzlyError {
  duration: number;
  constructor(
    message: string,
    duration?: number,
    context?: Record<string, unknown>
  );
}

export class ValidationError extends VizzlyError {
  errors: string[];
  constructor(
    message: string,
    errors?: string[],
    context?: Record<string, unknown>
  );
}

// ============================================================================
// SDK Types
// ============================================================================

export interface VizzlySDKInstance extends EventEmitter {
  config: VizzlyConfig;

  /** Reload file config and re-apply current in-memory overrides */
  init(): Promise<VizzlyConfig>;

  /** Merge new config values into the active SDK config */
  updateConfig(newConfig: Partial<VizzlyConfig>): VizzlyConfig;

  /** Start the Vizzly server */
  start(): Promise<{ port: number; url: string }>;

  /** Stop the Vizzly server */
  stop(): Promise<void>;

  /** Get current configuration */
  getConfig(): VizzlyConfig;

  /** Capture a screenshot */
  screenshot(
    name: string,
    imageBuffer: Buffer | string,
    options?: ScreenshotOptions
  ): Promise<void>;

  /** Upload all captured screenshots */
  upload(options?: UploadOptions): Promise<UploadResult>;

  /** Run local comparison in TDD mode */
  compare(
    name: string,
    imageBuffer: Buffer | string
  ): Promise<ComparisonResult>;

  /** Create an uploader using the SDK config */
  createUploader(options?: {
    upload?: UploadConfig;
    signal?: AbortSignal;
    batchSize?: number;
    timeout?: number;
  }): Uploader;

  /** Create a local TDD service using the SDK config */
  createTDDService(options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }): TddService;

  /** Start a local TDD service */
  startTDD(options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }): Promise<unknown>;
}

export class VizzlySDK extends EventEmitter implements VizzlySDKInstance {
  config: VizzlyConfig;

  constructor(config: VizzlyConfig, services: unknown);

  init(): Promise<VizzlyConfig>;
  updateConfig(newConfig: Partial<VizzlyConfig>): VizzlyConfig;
  start(): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
  getConfig(): VizzlyConfig;
  screenshot(
    name: string,
    imageBuffer: Buffer | string,
    options?: ScreenshotOptions
  ): Promise<void>;
  upload(options?: UploadOptions): Promise<UploadResult>;
  compare(
    name: string,
    imageBuffer: Buffer | string
  ): Promise<ComparisonResult>;
  createUploader(options?: {
    upload?: UploadConfig;
    signal?: AbortSignal;
    batchSize?: number;
    timeout?: number;
  }): Uploader;
  createTDDService(options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }): TddService;
  startTDD(options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }): Promise<unknown>;
}

// ============================================================================
// Service Types
// ============================================================================

export interface Uploader {
  upload(options: UploadOptions): Promise<UploadResult>;
  waitForBuild(buildId: string, timeout?: number): Promise<BuildResult>;
}

export interface TddService {
  downloadBaselines(
    environment?: string,
    branch?: string,
    buildId?: string,
    comparisonId?: string
  ): Promise<BaselineData | null>;

  loadBaseline(): Promise<BaselineData | null>;

  compareScreenshot(
    name: string,
    imageBuffer: Buffer,
    properties?: Record<string, unknown>
  ): Promise<ComparisonResult>;

  getResults(): TddResults;
  printResults(): Promise<TddResults>;
  updateBaselines(): number;
  acceptBaseline(idOrComparison: string | ComparisonResult): Promise<{
    name: string;
    status: string;
    message: string;
  }>;
}

export interface Services {
  serverManager: ServerManager;
  testRunner: TestRunnerService;
}

// ============================================================================
// Plugin API Types (Stable Contract)
// ============================================================================

/**
 * Stable TestRunner interface for plugins.
 * Only these methods are guaranteed to remain stable across minor versions.
 */
export interface PluginTestRunner {
  /** Listen for a single event emission */
  once(event: string, callback: (...args: unknown[]) => void): void;
  /** Subscribe to events */
  on(event: string, callback: (...args: unknown[]) => void): void;
  /** Unsubscribe from events */
  off(event: string, callback: (...args: unknown[]) => void): void;
  /** Create a new build and return the build ID */
  createBuild(options: BuildOptions, isTddMode: boolean): Promise<string>;
  /** Finalize a build after all screenshots are captured */
  finalizeBuild(
    buildId: string,
    isTddMode: boolean,
    success: boolean,
    executionTime: number
  ): Promise<void>;
}

/**
 * Stable ServerManager interface for plugins.
 * Only these methods are guaranteed to remain stable across minor versions.
 */
export interface PluginServerManager {
  /** Start the screenshot server */
  start(buildId: string, tddMode: boolean, setBaseline: boolean): Promise<void>;
  /** Stop the screenshot server */
  stop(): Promise<void>;
}

/**
 * Internal server manager returned by createServices().
 */
export interface ServerManager extends PluginServerManager {
  /** Get current TDD results from the local server handler */
  getTddResults(): Promise<TddResults | null>;
  /** Current HTTP server facade, if running */
  readonly server: unknown;
}

/**
 * Internal TestRunner returned by createServices().
 */
export interface TestRunnerService extends PluginTestRunner {
  /** Initialize daemon mode without running tests */
  initialize(options: Record<string, unknown>): Promise<void>;
  /** Run tests through the configured test command */
  run(options: Record<string, unknown>): Promise<unknown>;
  /** Cancel the active test process and stop the server */
  cancel(): Promise<void>;
}

export interface PluginGitInfo {
  branch: string;
  commit: string | null;
  message: string | null;
  prNumber: number | null;
  buildName: string;
}

export interface PluginGit {
  /** Detect branch, commit, commit message, PR number, and build name */
  detect(options?: { buildPrefix?: string }): Promise<PluginGitInfo>;
}

/**
 * Stable services interface for plugins.
 * This is the public API contract - internal services are NOT exposed.
 */
export interface PluginServices {
  git: PluginGit;
  testRunner: PluginTestRunner;
  serverManager: PluginServerManager;
}

/**
 * Build options for createBuild()
 */
export interface BuildOptions {
  port?: number;
  timeout?: number;
  buildName?: string;
  branch?: string;
  commit?: string;
  commit_sha?: string;
  message?: string;
  commit_message?: string;
  environment?: string;
  threshold?: number;
  eager?: boolean;
  allowNoToken?: boolean;
  wait?: boolean;
  uploadAll?: boolean;
  pullRequestNumber?: string | number;
  github_pull_request_number?: string | number;
  parallelId?: string;
  parallel_id?: string;
}

/**
 * Context object passed to plugin register() function.
 * This is the stable plugin API contract.
 */
export interface PluginContext {
  /** Merged Vizzly configuration */
  config: VizzlyConfig;
  /** Stable services for plugins */
  services: PluginServices;
  /** Output utilities for logging */
  output: OutputUtils;
}

/** Create stable plugin services from internal services */
export function createPluginServices(services: Services): PluginServices;

// ============================================================================
// Output Utilities
// ============================================================================

export interface OutputUtils {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(
    message: string,
    error?: Error | null,
    data?: Record<string, unknown>
  ): void;
  success(message: string, data?: Record<string, unknown>): void;
  debug(
    component: string,
    message: string,
    data?: Record<string, unknown>
  ): void;
  configure(options: OutputConfigureOptions): void;
}

export interface OutputConfigureOptions {
  json?: boolean | string;
  jsonFields?: string[] | null;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  verbose?: boolean;
  color?: boolean;
  silent?: boolean;
  logFile?: string | null;
  resetTimer?: boolean;
}

// ============================================================================
// Main Exports
// ============================================================================

/** Create a new Vizzly SDK instance */
export function createVizzly(
  config?: VizzlyConfig,
  options?: { verbose?: boolean }
): Promise<VizzlySDKInstance>;

/** Take a screenshot for visual regression testing */
export function vizzlyScreenshot(
  name: string,
  imageBuffer: Buffer | string,
  options?: {
    properties?: Record<string, unknown>;
    threshold?: number;
    minClusterSize?: number;
    fullPage?: boolean;
    requestTimeout?: number;
    buildId?: string;
    [key: string]: unknown;
  }
): Promise<ScreenshotResult | null>;

/** Configure the Vizzly client */
export function configure(config?: {
  serverUrl?: string;
  enabled?: boolean;
  failOnDiff?: boolean;
}): void;

/** Enable or disable screenshot capture */
export function setEnabled(enabled: boolean): void;

/** Create an uploader instance */
export function createUploader(
  config?: {
    apiKey?: string;
    apiUrl?: string;
    userAgent?: string;
    command?: string;
    upload?: UploadConfig;
  },
  options?: {
    signal?: AbortSignal;
    batchSize?: number;
    timeout?: number;
  }
): Uploader;

/** Create a TDD service instance */
export function createTDDService(
  config: VizzlyConfig,
  options?: {
    workingDir?: string;
    setBaseline?: boolean;
    authService?: unknown;
  }
): TddService;

/** Create all services with dependencies */
export function createServices(config: VizzlyConfig): Services;

/** Load configuration from file and environment */
export function loadConfig(options?: { cwd?: string }): Promise<VizzlyConfig>;

/** Define Vizzly configuration with type hints */
export function defineConfig(config: VizzlyConfig): VizzlyConfig;

/** Output utilities namespace */
export const output: OutputUtils;
