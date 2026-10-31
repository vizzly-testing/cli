import { VizzlyError } from '../../errors/vizzly-error.js';

export let COMPACT_CONTEXT_LIMIT = 10;

let COMPACT_SUMMARY_MAX_BYTES = 64 * 1024;

let COMPACT_DIFFS_MAX_BYTES = 512 * 1024;

function getCompactPage(collection, label) {
  if (!collection || !Array.isArray(collection.items) || !collection.page) {
    throw new VizzlyError(
      `Vizzly returned an invalid compact ${label} collection`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (collection.items.length > COMPACT_CONTEXT_LIMIT) {
    throw new VizzlyError(
      `Vizzly returned more than ${COMPACT_CONTEXT_LIMIT} compact ${label} items`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (collection.items.some(item => !item || typeof item !== 'object')) {
    throw new VizzlyError(
      `Vizzly returned an invalid item in compact ${label}`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  let { page } = collection;
  let validLimit =
    Number.isInteger(page.limit) &&
    page.limit >= 1 &&
    page.limit <= COMPACT_CONTEXT_LIMIT;
  let validReturned =
    Number.isInteger(page.returned) &&
    page.returned === collection.items.length;
  let validTotal =
    page.total == null ||
    (Number.isInteger(page.total) &&
      page.total >= 0 &&
      page.total >= page.returned);
  let validHasMore = typeof page.has_more === 'boolean';
  let validCursor =
    page.next_cursor == null ||
    (typeof page.next_cursor === 'string' && page.next_cursor.length > 0);

  if (
    !validLimit ||
    !validReturned ||
    !validTotal ||
    !validHasMore ||
    !validCursor
  ) {
    throw new VizzlyError(
      `Vizzly returned invalid pagination facts for compact ${label}`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (page.included === false && collection.items.length > 0) {
    throw new VizzlyError(
      `Vizzly returned items for an omitted compact ${label} collection`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (page.has_more !== Boolean(page.next_cursor)) {
    throw new VizzlyError(
      `Vizzly returned contradictory pagination facts for compact ${label}`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  return collection;
}

export function validateCompactContext(context, resource) {
  if (!context || typeof context !== 'object') {
    throw new VizzlyError(
      `Vizzly returned an invalid compact ${resource} context`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (context.resource !== `${resource}_context` || !context[resource]?.id) {
    throw new VizzlyError(
      `Vizzly returned an invalid compact ${resource} context`,
      'COMPACT_CONTEXT_INVALID'
    );
  }

  if (resource === 'build') {
    getCompactPage(context.evidence, 'build evidence');
  } else {
    let history = context.history || {};
    getCompactPage(history.similar_by_fingerprint, 'similar history');
    getCompactPage(history.recent_by_name, 'recent history');
  }

  return context;
}

export function validateCompactOutputSize(payload, resource, details) {
  let bytes = Buffer.byteLength(JSON.stringify(payload));
  let maxBytes =
    details === 'diffs' ? COMPACT_DIFFS_MAX_BYTES : COMPACT_SUMMARY_MAX_BYTES;

  if (bytes > maxBytes) {
    throw new VizzlyError(
      `Vizzly produced an oversized compact ${resource} context`,
      'COMPACT_CONTEXT_OVERSIZED',
      { bytes, max_bytes: maxBytes }
    );
  }

  return payload;
}
