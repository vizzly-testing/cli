import { VizzlyError } from './vizzly-error.js';

export let SDK_API_VERSION = '2026-09-12';

/** Read one CLI result window using bounded pages from the cloud API. */
export async function readCloudPage(client, endpoint, key, filters = {}) {
  let { limit = 50, offset = 0, ...query } = filters;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 250 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000
  ) {
    throw new VizzlyError(
      'Use --limit 1–250 and --offset 0–10000.',
      'INVALID_PAGE'
    );
  }
  let items = [];
  let seen = new Set();
  let nextOffset = offset;
  let meta;
  do {
    let pageLimit = Math.min(50, limit - items.length);
    let params = new URLSearchParams(query);
    params.set('limit', String(pageLimit));
    params.set('offset', String(nextOffset));
    let response = await client.request(`${endpoint}?${params}`, {
      headers: { 'Vizzly-API-Version': SDK_API_VERSION },
    });
    meta = response.meta;
    let page = response[key];
    if (
      !Array.isArray(page) ||
      !Number.isInteger(meta?.total) ||
      !Number.isInteger(meta?.limit) ||
      meta.limit <= 0 ||
      meta.limit > pageLimit ||
      meta.offset !== nextOffset ||
      typeof meta.hasMore !== 'boolean'
    ) {
      throw new VizzlyError(
        'Invalid cloud list response.',
        'INVALID_PAGE_RESPONSE'
      );
    }
    if (
      page.length > meta.limit ||
      page.some(item => typeof item.id !== 'string')
    ) {
      throw new VizzlyError(
        'Invalid cloud list items.',
        'INVALID_PAGE_RESPONSE'
      );
    }
    let before = items.length;
    for (let item of page) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        items.push(item);
      }
    }
    nextOffset += meta.limit;
    if (meta.hasMore && (page.length === 0 || items.length === before)) {
      throw new VizzlyError(
        'Cloud results changed while paging. Run the command again.',
        'PAGE_CHANGED'
      );
    }
  } while (meta.hasMore && items.length < limit && nextOffset <= 10000);
  return {
    [key]: items,
    pagination: {
      total: meta.total,
      limit,
      offset,
      hasMore: meta.hasMore,
      nextOffset: meta.hasMore && nextOffset <= 10000 ? nextOffset : null,
    },
  };
}
