/**
 * Tests for screenshot functions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateScreenshotName } from '../src/screenshot.js';

describe('generateScreenshotName', () => {
  it('should generate correct screenshot name', () => {
    let story = { title: 'Button', name: 'Primary' };
    let viewport = { name: 'mobile' };

    let name = generateScreenshotName(story, viewport);

    assert.equal(name, 'Button-Primary@mobile');
  });

  it('should handle complex component names', () => {
    let story = { title: 'Components/Atoms/Button', name: 'WithIcon' };
    let viewport = { name: 'desktop' };

    let name = generateScreenshotName(story, viewport);

    assert.equal(name, 'Components-Atoms-Button-WithIcon@desktop');
  });

  it('should handle special characters', () => {
    let story = { title: 'Form/Input Field', name: 'With Label & Error' };
    let viewport = { name: 'tablet' };

    let name = generateScreenshotName(story, viewport);

    assert.equal(name, 'Form-Input Field-With Label & Error@tablet');
  });
});
