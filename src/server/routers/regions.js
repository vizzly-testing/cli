/**
 * Regions Router
 * Handles user-defined hotspot region sync from cloud
 */

import * as output from '../../utils/output.js';
import { parseJsonBody } from '../middleware/json-parser.js';
import {
  sendError,
  sendServiceUnavailable,
  sendSuccess,
} from '../middleware/response.js';

/**
 * Create regions router
 * @param {Object} context - Router context
 * @param {Object} context.tddService - TDD service for region sync
 * @returns {Function} Route handler
 */
export function createRegionsRouter({ tddService }) {
  return async function handleRegionsRoute(req, res, pathname) {
    // Sync regions from cloud
    if (req.method === 'POST' && pathname === '/api/regions/sync') {
      if (!tddService) {
        sendServiceUnavailable(
          res,
          'TDD service not available (only available in TDD mode)'
        );
        return true;
      }

      try {
        let body = await parseJsonBody(req);
        let { includeCandidates = false } = body;

        output.info('Syncing regions from cloud...');

        let result = await tddService.downloadRegions({ includeCandidates });

        if (!result.success) {
          sendError(res, 500, result.error || 'Failed to sync regions');
          return true;
        }

        sendSuccess(res, {
          success: true,
          message: `Synced ${result.regionCount} regions for ${result.count} screenshots`,
          count: result.count,
          regionCount: result.regionCount,
        });
        return true;
      } catch (error) {
        output.error('Error syncing regions:', error);
        sendError(res, 500, error.message);
        return true;
      }
    }

    return false;
  };
}
