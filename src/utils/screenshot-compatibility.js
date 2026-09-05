export let CURRENT_SCREENSHOT_FORMAT_VERSION = 2;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

/**
 * Older local clients wrapped the user bag in another `properties` key. New
 * clients send a format version so a user property named `properties` remains
 * untouched. Remove this file after those older clients are unsupported.
 */
export function readScreenshotProperties(properties, formatVersion) {
  let source = plainObject(properties);
  if (formatVersion === CURRENT_SCREENSHOT_FORMAT_VERSION) return source;

  if (
    !source.properties ||
    typeof source.properties !== 'object' ||
    Array.isArray(source.properties)
  )
    return source;

  let unwrapped = {
    ...source,
    ...source.properties,
  };
  delete unwrapped.properties;
  return unwrapped;
}
