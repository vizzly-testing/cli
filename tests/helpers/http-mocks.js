import { EventEmitter } from 'node:events';

export function createMockRequest(method = 'GET', body = null) {
  let req = new EventEmitter();
  req.method = method;

  if (body !== null) {
    let didEmitBody = false;
    let originalOn = req.on.bind(req);

    req.on = (eventName, listener) => {
      let result = originalOn(eventName, listener);

      if (eventName === 'end' && !didEmitBody) {
        didEmitBody = true;
        req.emit('data', JSON.stringify(body));
        req.emit('end');
      }

      return result;
    };
  }

  return req;
}

export function createMockResponse() {
  let headers = {};
  let statusCode = null;
  let body = null;

  return {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = code;
    },
    setHeader(name, value) {
      headers[name] = value;
    },
    getHeader(name) {
      return headers[name];
    },
    end(content) {
      body = content;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
    getParsedBody() {
      return body && typeof body === 'string' ? JSON.parse(body) : body;
    },
  };
}
