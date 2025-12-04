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
  batchSize?: number;
  timeout?: number;
}

export interface ComparisonConfig {
  threshold?: number;
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
  fullPage?: boolean;
  buildId?: string;
}

export interface ScreenshotResult {
  success: boolean;
  status?: 'passed' | 'failed' | 'new';
  name?: string;
  diffPercentage?: number;
}

// ============================================================================
// Comparison Types
// ============================================================================

export interface ComparisonResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'new' | 'error' | 'baseline-updated';
  baseline: string;
  current: string;
  diff: string | null;
  properties: Record<string, unknown>;
  signature: string;
  threshold?: number;
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
  pullRequestNumber?: string;
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
  passedComparisons?: number;
  failedComparisons?: number;
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
}

export class VizzlySDK extends EventEmitter implements VizzlySDKInstance {
  config: VizzlyConfig;

  constructor(config: VizzlyConfig, services: unknown);

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
  apiService: unknown;
  authService: unknown;
  configService: unknown;
  projectService: unknown;
  uploader: Uploader;
  buildManager: unknown;
  serverManager: unknown;
  tddService: TddService;
  testRunner: unknown;
}

// ============================================================================
// Output Utilities
// ============================================================================

export interface OutputUtils {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  debug(category: string, ...args: unknown[]): void;
  configure(options: { verbose?: boolean }): void;
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
    fullPage?: boolean;
  }
): Promise<void>;

/** Configure the Vizzly client */
export function configure(config?: {
  serverUrl?: string;
  enabled?: boolean;
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
export function createServices(
  config: VizzlyConfig,
  command?: string
): Services;

/** Load configuration from file and environment */
export function loadConfig(options?: { cwd?: string }): Promise<VizzlyConfig>;

/** Define Vizzly configuration with type hints */
export function defineConfig(config: VizzlyConfig): VizzlyConfig;

/** Output utilities namespace */
export const output: OutputUtils;
