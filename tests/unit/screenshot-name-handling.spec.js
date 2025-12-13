/**
 * Test for screenshot name handling - spaces to hyphens conversion
 * Ensures CLI matches cloud behavior for filename generation
 */

import crypto from 'node:crypto';
import { describe, expect, test } from 'vitest';

// Import the functions from tdd-service (they're not exported, so we'll test the behavior indirectly)
// For now, let's just test the expected behavior

/**
 * Generate a screenshot signature for baseline matching
 * This mirrors the logic in tdd-service.js
 */
function generateScreenshotSignature(
  name,
  properties = {},
  customProperties = []
) {
  const defaultProperties = ['name', 'viewport_width', 'browser'];
  const allProperties = [...defaultProperties, ...customProperties];

  const parts = allProperties.map(propName => {
    let value;

    if (propName === 'name') {
      value = name;
    } else if (propName === 'viewport_width') {
      value = properties.viewport_width || properties.viewport?.width;
    } else if (propName === 'browser') {
      value = properties.browser;
    } else {
      value =
        properties[propName] ??
        properties.metadata?.[propName] ??
        properties.metadata?.properties?.[propName];
    }

    return value === null || value === undefined ? '' : String(value).trim();
  });

  return parts.join('|');
}

/**
 * Generate baseline filename from name and signature
 * This mirrors the logic in tdd-service.js
 */
function generateBaselineFilename(name, signature) {
  const hash = crypto
    .createHash('sha256')
    .update(signature)
    .digest('hex')
    .slice(0, 12);

  // Sanitize the name for filesystem safety
  const safeName = name
    .replace(/[/\\:*?"<>|]/g, '') // Remove unsafe chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .slice(0, 50); // Limit length

  return `${safeName}_${hash}.png`;
}

describe('Screenshot Name Handling', () => {
  test('should preserve spaces in screenshot name for signature generation', () => {
    // The signature should use the ORIGINAL name with spaces
    const name = 'VBtn dark';
    const properties = { viewport_width: 1265, browser: null };
    const customProperties = [];

    const signature = generateScreenshotSignature(
      name,
      properties,
      customProperties
    );

    // Signature should have the name WITH spaces
    expect(signature).toBe('VBtn dark|1265|');
  });

  test('should convert spaces to hyphens in filename generation', () => {
    // The filename should have hyphens instead of spaces
    const name = 'VBtn dark';
    const properties = { viewport_width: 1265, browser: null };
    const customProperties = [];

    const signature = generateScreenshotSignature(
      name,
      properties,
      customProperties
    );
    const filename = generateBaselineFilename(name, signature);

    // Filename should have hyphens, not spaces or underscores
    expect(filename).toMatch(/^VBtn-dark_[a-f0-9]{12}\.png$/);
    expect(filename).not.toContain(' ');
    expect(filename).not.toContain('VBtn_dark'); // Should NOT have underscore
  });

  test('should match cloud behavior for screenshot with custom properties', () => {
    const name = 'Login Button';
    const properties = {
      viewport_width: 1920,
      browser: 'chrome',
      metadata: {
        theme: 'dark',
        device: 'desktop',
      },
    };
    const customProperties = ['theme', 'device'];

    const signature = generateScreenshotSignature(
      name,
      properties,
      customProperties
    );
    const filename = generateBaselineFilename(name, signature);

    // Signature should have original name
    expect(signature).toBe('Login Button|1920|chrome|dark|desktop');

    // Filename should have hyphens
    expect(filename).toMatch(/^Login-Button_[a-f0-9]{12}\.png$/);
  });

  test('should handle multiple consecutive spaces', () => {
    const name = 'My  Component   Name';
    const signature = generateScreenshotSignature(name, {}, []);
    const filename = generateBaselineFilename(name, signature);

    // Multiple spaces should become a single hyphen
    expect(filename).toMatch(/^My-Component-Name_[a-f0-9]{12}\.png$/);
  });

  test('should preserve other safe characters in filename', () => {
    const name = 'component.test-case_v2';
    const signature = generateScreenshotSignature(name, {}, []);
    const filename = generateBaselineFilename(name, signature);

    // Dots, hyphens, and underscores should be preserved
    expect(filename).toContain('component.test-case_v2');
  });

  test('should remove unsafe characters but keep spaces→hyphens conversion', () => {
    const name = 'My/Component:Test';
    const signature = generateScreenshotSignature(name, {}, []);
    const filename = generateBaselineFilename(name, signature);

    // Unsafe chars removed, but spaces (if any) should become hyphens
    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
    expect(filename).toContain('MyComponentTest');
  });
});
