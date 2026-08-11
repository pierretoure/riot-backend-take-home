import { EventEmitter } from 'node:events';
import {
  Logger,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

/** Minimal request shape covering exactly what the interceptor reads. */
interface FakeRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
  url: string;
  route?: { path: string };
  body?: unknown;
  requestId?: string;
}

class FakeResponse extends EventEmitter {
  statusCode = 200;
  private readonly headers = new Map<string, string>();

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name);
  }
}

function createContext(
  request: FakeRequest,
  response: FakeResponse,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function createHandler(): CallHandler {
  return { handle: () => of('ok') };
}

type LoggerSpy = jest.SpyInstance<void, [message: unknown, ...rest: unknown[]]>;

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logSpy: LoggerSpy;
  let warnSpy: LoggerSpy;
  let errorSpy: LoggerSpy;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses a plausible x-request-id header', (done) => {
    const request: FakeRequest = {
      headers: { 'x-request-id': 'client-generated-id-123' },
      method: 'GET',
      url: '/health',
    };
    const response = new FakeResponse();

    interceptor
      .intercept(createContext(request, response), createHandler())
      .subscribe(() => {
        expect(request.requestId).toBe('client-generated-id-123');
        expect(response.getHeader('x-request-id')).toBe(
          'client-generated-id-123',
        );
        done();
      });
  });

  it('generates a request id when the header is missing', (done) => {
    const request: FakeRequest = { headers: {}, method: 'GET', url: '/health' };
    const response = new FakeResponse();

    interceptor
      .intercept(createContext(request, response), createHandler())
      .subscribe(() => {
        expect(request.requestId).toEqual(expect.any(String));
        expect(request.requestId?.length).toBeGreaterThan(0);
        done();
      });
  });

  it('generates a request id when the header contains implausible content', (done) => {
    const request: FakeRequest = {
      headers: { 'x-request-id': 'not a valid id !! <script>' },
      method: 'GET',
      url: '/health',
    };
    const response = new FakeResponse();

    interceptor
      .intercept(createContext(request, response), createHandler())
      .subscribe(() => {
        expect(request.requestId).not.toBe('not a valid id !! <script>');
        done();
      });
  });

  it('logs a structured JSON line with method, route, statusCode, durationMs and requestId', (done) => {
    const request: FakeRequest = {
      headers: { 'x-request-id': 'req-abc' },
      method: 'POST',
      url: '/encrypt',
      route: { path: '/encrypt' },
    };
    const response = new FakeResponse();
    response.statusCode = 200;

    interceptor
      .intercept(createContext(request, response), createHandler())
      .subscribe(() => {
        response.emit('finish');

        expect(logSpy).toHaveBeenCalledTimes(1);
        const [line] = logSpy.mock.calls[0] as [string];
        const parsed = JSON.parse(line) as Record<string, unknown>;

        expect(parsed).toMatchObject({
          method: 'POST',
          route: '/encrypt',
          statusCode: 200,
          requestId: 'req-abc',
        });
        expect(typeof parsed.durationMs).toBe('number');
        done();
      });
  });

  it('logs 4xx responses at warn level and 5xx responses at error level', (done) => {
    const request: FakeRequest = {
      headers: {},
      method: 'POST',
      url: '/verify',
    };
    const response = new FakeResponse();
    response.statusCode = 400;

    interceptor
      .intercept(createContext(request, response), createHandler())
      .subscribe(() => {
        response.emit('finish');
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        done();
      });
  });

  it('never logs request body content, even when it contains a sensitive sentinel value', (done) => {
    const request: FakeRequest = {
      headers: { 'x-request-id': 'req-secret' },
      method: 'POST',
      url: '/sign',
      route: { path: '/sign' },
      body: { secret: 'SECRET-LEAK-SENTINEL' },
    };
    const response = new FakeResponse();

    interceptor
      .intercept(createContext(request, response), createHandler())
      .subscribe(() => {
        response.emit('finish');

        const loggedOutput = JSON.stringify([
          ...logSpy.mock.calls,
          ...warnSpy.mock.calls,
          ...errorSpy.mock.calls,
        ]);
        expect(loggedOutput).not.toContain('SECRET-LEAK-SENTINEL');
        done();
      });
  });
});
