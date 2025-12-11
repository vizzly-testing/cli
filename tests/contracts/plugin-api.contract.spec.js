/**
 * Plugin API Contract Tests
 *
 * These tests enforce the stable plugin API contract. If any of these tests
 * fail, it means a breaking change was introduced to the plugin API.
 *
 * DO NOT modify these tests without updating the plugin API version.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPluginServices } from '../../src/plugin-api.js';

describe('Plugin API Contract', () => {
  let mockServices;
  let pluginServices;

  beforeEach(() => {
    // Create mock internal services that match the real implementation
    let mockTestRunner = new EventEmitter();
    mockTestRunner.createBuild = vi.fn().mockResolvedValue('build-123');
    mockTestRunner.finalizeBuild = vi.fn().mockResolvedValue(undefined);

    let mockServerManager = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    mockServices = {
      testRunner: mockTestRunner,
      serverManager: mockServerManager,
      // Internal services that should NOT be exposed
      apiService: { request: vi.fn() },
      authService: { getToken: vi.fn() },
      configService: { get: vi.fn() },
      projectService: { getProject: vi.fn() },
      uploader: { upload: vi.fn() },
      buildManager: { create: vi.fn() },
      tddService: { compare: vi.fn() },
    };

    pluginServices = createPluginServices(mockServices);
  });

  describe('Structure', () => {
    it('exposes testRunner', () => {
      expect(pluginServices.testRunner).toBeDefined();
    });

    it('exposes serverManager', () => {
      expect(pluginServices.serverManager).toBeDefined();
    });

    it('does NOT expose internal services', () => {
      expect(pluginServices.apiService).toBeUndefined();
      expect(pluginServices.authService).toBeUndefined();
      expect(pluginServices.configService).toBeUndefined();
      expect(pluginServices.projectService).toBeUndefined();
      expect(pluginServices.uploader).toBeUndefined();
      expect(pluginServices.buildManager).toBeUndefined();
      expect(pluginServices.tddService).toBeUndefined();
    });

    it('is frozen (immutable)', () => {
      expect(Object.isFrozen(pluginServices)).toBe(true);
    });

    it('has frozen testRunner', () => {
      expect(Object.isFrozen(pluginServices.testRunner)).toBe(true);
    });

    it('has frozen serverManager', () => {
      expect(Object.isFrozen(pluginServices.serverManager)).toBe(true);
    });
  });

  describe('testRunner contract', () => {
    it('exposes once() method', () => {
      expect(typeof pluginServices.testRunner.once).toBe('function');
    });

    it('exposes on() method', () => {
      expect(typeof pluginServices.testRunner.on).toBe('function');
    });

    it('exposes off() method', () => {
      expect(typeof pluginServices.testRunner.off).toBe('function');
    });

    it('exposes createBuild() method', () => {
      expect(typeof pluginServices.testRunner.createBuild).toBe('function');
    });

    it('exposes finalizeBuild() method', () => {
      expect(typeof pluginServices.testRunner.finalizeBuild).toBe('function');
    });

    it('once() works with build-created event', () => {
      let callback = vi.fn();
      pluginServices.testRunner.once('build-created', callback);

      mockServices.testRunner.emit('build-created', {
        url: 'https://example.com',
      });

      expect(callback).toHaveBeenCalledWith({ url: 'https://example.com' });
    });

    it('createBuild() returns a promise with buildId', async () => {
      let options = { buildName: 'Test Build' };
      let result = await pluginServices.testRunner.createBuild(options, false);

      expect(result).toBe('build-123');
      expect(mockServices.testRunner.createBuild).toHaveBeenCalledWith(
        options,
        false
      );
    });

    it('finalizeBuild() accepts correct parameters', async () => {
      await pluginServices.testRunner.finalizeBuild(
        'build-123',
        false,
        true,
        1000
      );

      expect(mockServices.testRunner.finalizeBuild).toHaveBeenCalledWith(
        'build-123',
        false,
        true,
        1000
      );
    });
  });

  describe('serverManager contract', () => {
    it('exposes start() method', () => {
      expect(typeof pluginServices.serverManager.start).toBe('function');
    });

    it('exposes stop() method', () => {
      expect(typeof pluginServices.serverManager.stop).toBe('function');
    });

    it('start() accepts correct parameters', async () => {
      await pluginServices.serverManager.start('build-123', false, false);

      expect(mockServices.serverManager.start).toHaveBeenCalledWith(
        'build-123',
        false,
        false
      );
    });

    it('stop() works correctly', async () => {
      await pluginServices.serverManager.stop();

      expect(mockServices.serverManager.stop).toHaveBeenCalled();
    });
  });

  describe('Immutability', () => {
    it('prevents adding new properties to pluginServices', () => {
      expect(() => {
        pluginServices.newProp = 'value';
      }).toThrow();
    });

    it('prevents adding new properties to testRunner', () => {
      expect(() => {
        pluginServices.testRunner.newMethod = () => {};
      }).toThrow();
    });

    it('prevents adding new properties to serverManager', () => {
      expect(() => {
        pluginServices.serverManager.newMethod = () => {};
      }).toThrow();
    });
  });
});
