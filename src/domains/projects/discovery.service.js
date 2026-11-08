import { readCloudPage } from '../../shared/cloud-pagination.js';

export function discoverProjects(client, options = {}) {
  let filters = {};
  if (options.org) filters.organization = options.org;
  if (options.repository) filters.repository = options.repository;
  if (options.limit !== undefined) filters.limit = options.limit;
  if (options.offset !== undefined) filters.offset = options.offset;
  return readCloudPage(client, '/api/sdk/projects', 'projects', filters);
}

export function discoverOrganizations(client, options = {}) {
  return readCloudPage(client, '/api/sdk/organizations', 'organizations', {
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
  });
}
