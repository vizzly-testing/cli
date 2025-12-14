import { describe, expect, it, vi } from 'vitest';
import {
  handleRequest,
  parseRequestBody,
  startServer,
  stopServer,
} from '../../src/screenshot-server/operations.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockOutput() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };
}

function createMockRequest(overrides = {}) {
  let listeners = {};
  return {
    method: 'POST',
    url: '/screenshot',
    on: vi.fn((event, callback) => {
      listeners[event] = callback;
    }),
    __emit: (event, data) => {
      if (listeners[event]) {
        listeners[event](data);
      }
    },
    ...overrides,
  };
}

function createMockResponse() {
  return {
    statusCode: 200,
    end: vi.fn(),
    setHeader: vi.fn(),
  };
}

function createMockBuildManager(overrides = {}) {
  return {
    addScreenshot: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockError(message, code) {
  let error = new Error(message);
  error.code = code;
  return error;
}

function createMockHttpServer() {
  let mockServer = {
    listen: vi.fn(),
    close: vi.fn(),
  };
  return mockServer;
}

// ============================================================================
// Tests
// ============================================================================

describe('screenshot-server/operations', () => {
  describe('parseRequestBody', () => {
    it('parses valid JSON body', async () => {
      let req = createMockRequest();
      let body = { name: 'test', image: 'data' };

      let promise = parseRequestBody({
        req,
        deps: { createError: createMockError },
      });

      req.__emit('data', JSON.stringify(body));
      req.__emit('end');

      let result = await promise;
      expect(result).toEqual(body);
    });

    it('handles chunked data', async () => {
      let req = createMockRequest();
      let body = { name: 'test', image: 'data' };
      let json = JSON.stringify(body);

      let promise = parseRequestBody({
        req,
        deps: { createError: createMockError },
      });

      req.__emit('data', json.slice(0, 10));
      req.__emit('data', json.slice(10));
      req.__emit('end');

      let result = await promise;
      expect(result).toEqual(body);
    });

    it('rejects on invalid JSON', async () => {
      let req = createMockRequest();

      let promise = parseRequestBody({
        req,
        deps: { createError: createMockError },
      });

      req.__emit('data', 'invalid json');
      req.__emit('end');

      await expect(promise).rejects.toThrow('Invalid JSON in request body');
    });

    it('rejects on request error', async () => {
      let req = createMockRequest();

      let promise = parseRequestBody({
        req,
        deps: { createError: createMockError },
      });

      req.__emit('error', new Error('Connection reset'));

      await expect(promise).rejects.toThrow('Request error: Connection reset');
    });

    it('rejects on empty body', async () => {
      let req = createMockRequest();

      let promise = parseRequestBody({
        req,
        deps: { createError: createMockError },
      });

      req.__emit('end');

      await expect(promise).rejects.toThrow('Invalid JSON in request body');
    });
  });

  describe('handleRequest', () => {
    it('processes valid screenshot request', async () => {
      let req = createMockRequest();
      let res = createMockResponse();
      let buildManager = createMockBuildManager();
      let output = createMockOutput();

      let body = {
        buildId: 'build-123',
        name: 'test-screenshot',
        image: 'base64-data',
        properties: { viewport: '1920x1080' },
      };

      let handlePromise = handleRequest({
        req,
        res,
        deps: {
          buildManager,
          createError: createMockError,
          output,
        },
      });

      req.__emit('data', JSON.stringify(body));
      req.__emit('end');

      await handlePromise;

      expect(buildManager.addScreenshot).toHaveBeenCalledWith('build-123', {
        name: 'test-screenshot',
        image: 'base64-data',
        properties: { viewport: '1920x1080' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.end).toHaveBeenCalledWith(JSON.stringify({ success: true }));
    });

    it('uses default buildId when not provided', async () => {
      let req = createMockRequest();
      let res = createMockResponse();
      let buildManager = createMockBuildManager();
      let output = createMockOutput();

      let body = { name: 'test', image: 'data' };

      let handlePromise = handleRequest({
        req,
        res,
        deps: {
          buildManager,
          createError: createMockError,
          output,
        },
      });

      req.__emit('data', JSON.stringify(body));
      req.__emit('end');

      await handlePromise;

      expect(buildManager.addScreenshot).toHaveBeenCalledWith(
        'default',
        expect.any(Object)
      );
    });

    it('returns 400 when name is missing', async () => {
      let req = createMockRequest();
      let res = createMockResponse();
      let output = createMockOutput();

      let body = { image: 'data' };

      let handlePromise = handleRequest({
        req,
        res,
        deps: {
          buildManager: createMockBuildManager(),
          createError: createMockError,
          output,
        },
      });

      req.__emit('data', JSON.stringify(body));
      req.__emit('end');

      await handlePromise;

      expect(res.statusCode).toBe(400);
      expect(res.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'name and image are required' })
      );
    });

    it('returns 400 when image is missing', async () => {
      let req = createMockRequest();
      let res = createMockResponse();
      let output = createMockOutput();

      let body = { name: 'test' };

      let handlePromise = handleRequest({
        req,
        res,
        deps: {
          buildManager: createMockBuildManager(),
          createError: createMockError,
          output,
        },
      });

      req.__emit('data', JSON.stringify(body));
      req.__emit('end');

      await handlePromise;

      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for non-screenshot endpoint', async () => {
      let req = createMockRequest({ url: '/health' });
      let res = createMockResponse();

      await handleRequest({
        req,
        res,
        deps: {
          buildManager: createMockBuildManager(),
          createError: createMockError,
          output: createMockOutput(),
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Not found' })
      );
    });

    it('returns 404 for GET request', async () => {
      let req = createMockRequest({ method: 'GET' });
      let res = createMockResponse();

      await handleRequest({
        req,
        res,
        deps: {
          buildManager: createMockBuildManager(),
          createError: createMockError,
          output: createMockOutput(),
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 500 when buildManager throws', async () => {
      let req = createMockRequest();
      let res = createMockResponse();
      let output = createMockOutput();
      let buildManager = createMockBuildManager({
        addScreenshot: vi.fn().mockRejectedValue(new Error('Storage failed')),
      });

      let body = { name: 'test', image: 'data' };

      let handlePromise = handleRequest({
        req,
        res,
        deps: {
          buildManager,
          createError: createMockError,
          output,
        },
      });

      req.__emit('data', JSON.stringify(body));
      req.__emit('end');

      await handlePromise;

      expect(res.statusCode).toBe(500);
      expect(res.end).toHaveBeenCalledWith(
        JSON.stringify({ error: 'Internal server error' })
      );
      expect(output.error).toHaveBeenCalledWith(
        'Failed to process screenshot:',
        expect.any(Error)
      );
    });

    it('returns 500 when JSON parsing fails', async () => {
      let req = createMockRequest();
      let res = createMockResponse();
      let output = createMockOutput();

      let handlePromise = handleRequest({
        req,
        res,
        deps: {
          buildManager: createMockBuildManager(),
          createError: createMockError,
          output,
        },
      });

      req.__emit('data', 'invalid json');
      req.__emit('end');

      await handlePromise;

      expect(res.statusCode).toBe(500);
      expect(output.error).toHaveBeenCalled();
    });
  });

  describe('startServer', () => {
    it('starts server successfully', async () => {
      let mockServer = createMockHttpServer();
      mockServer.listen.mockImplementation((_port, _host, callback) => {
        callback(null);
      });

      let createHttpServer = vi.fn(() => mockServer);
      let output = createMockOutput();
      let requestHandler = vi.fn();

      let server = await startServer({
        config: { server: { port: 8080 } },
        requestHandler,
        deps: {
          createHttpServer,
          createError: createMockError,
          output,
        },
      });

      expect(createHttpServer).toHaveBeenCalledWith(requestHandler);
      expect(mockServer.listen).toHaveBeenCalledWith(
        8080,
        '127.0.0.1',
        expect.any(Function)
      );
      expect(output.info).toHaveBeenCalledWith(
        'Screenshot server listening on http://127.0.0.1:8080'
      );
      expect(server).toBe(mockServer);
    });

    it('uses default port when not configured', async () => {
      let mockServer = createMockHttpServer();
      mockServer.listen.mockImplementation((_port, _host, callback) => {
        callback(null);
      });

      await startServer({
        config: {},
        requestHandler: vi.fn(),
        deps: {
          createHttpServer: vi.fn(() => mockServer),
          createError: createMockError,
          output: createMockOutput(),
        },
      });

      expect(mockServer.listen).toHaveBeenCalledWith(
        3000,
        '127.0.0.1',
        expect.any(Function)
      );
    });

    it('rejects on server start error', async () => {
      let mockServer = createMockHttpServer();
      let startError = new Error('Port in use');
      mockServer.listen.mockImplementation((_port, _host, callback) => {
        callback(startError);
      });

      await expect(
        startServer({
          config: { server: { port: 8080 } },
          requestHandler: vi.fn(),
          deps: {
            createHttpServer: vi.fn(() => mockServer),
            createError: createMockError,
            output: createMockOutput(),
          },
        })
      ).rejects.toThrow('Failed to start screenshot server: Port in use');
    });
  });

  describe('stopServer', () => {
    it('stops server successfully', async () => {
      let mockServer = createMockHttpServer();
      mockServer.close.mockImplementation(callback => callback());

      let output = createMockOutput();

      await stopServer({
        server: mockServer,
        deps: { output },
      });

      expect(mockServer.close).toHaveBeenCalledWith(expect.any(Function));
      expect(output.info).toHaveBeenCalledWith('Screenshot server stopped');
    });

    it('handles null server gracefully', async () => {
      let output = createMockOutput();

      await stopServer({
        server: null,
        deps: { output },
      });

      expect(output.info).not.toHaveBeenCalled();
    });

    it('handles undefined server gracefully', async () => {
      let output = createMockOutput();

      await stopServer({
        server: undefined,
        deps: { output },
      });

      expect(output.info).not.toHaveBeenCalled();
    });
  });
});
