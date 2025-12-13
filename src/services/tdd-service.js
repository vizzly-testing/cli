/**
 * TDD Service - Local Visual Testing
 *
 * This file re-exports from the refactored TDD module for backwards compatibility.
 * The actual implementation now lives in src/tdd/tdd-service.js
 *
 * CRITICAL: Signature/filename generation MUST stay in sync with the cloud!
 * See src/tdd/core/signature.js for details.
 *
 * Cloud counterpart: vizzly/src/utils/screenshot-identity.js
 * Contract tests: tests/contracts/signature-parity.spec.js
 */

export { TddService, createTDDService } from '../tdd/tdd-service.js';
