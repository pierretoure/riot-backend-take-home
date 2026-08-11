import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import type { RequestWithId } from '../interceptors/logging.interceptor';

interface HostFixture {
  host: ArgumentsHost;
  json: jest.Mock<void, [unknown]>;
  status: jest.Mock;
}

function createHost(requestId?: string): HostFixture {
  const json = jest.fn<void, [unknown]>();
  const status = jest.fn().mockReturnValue({ json });
  const request: Partial<RequestWithId> =
    requestId !== undefined ? { requestId } : {};

  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status }),
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // Silence the server-side error log for unhandled exceptions: it is
    // exercised explicitly below, but should not pollute test output.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves status and message for a plain HttpException', () => {
    const { host, json, status } = createHost('req-1');

    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
      requestId: 'req-1',
    });
  });

  it('preserves a custom HttpException status and message', () => {
    const { host, json, status } = createHost('req-1b');

    filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: 'nope',
      requestId: 'req-1b',
    });
  });

  it('preserves validation messages from a ValidationPipe BadRequestException', () => {
    const { host, json, status } = createHost('req-2');

    filter.catch(new BadRequestException(['field must not be empty']), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      error: 'Bad Request',
      message: ['field must not be empty'],
      requestId: 'req-2',
    });
  });

  it('maps an unknown Error to a generic 500', () => {
    const { host, json, status } = createHost('req-3');

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      requestId: 'req-3',
    });
  });

  it('still returns a requestId field when none was attached to the request', () => {
    const { host, json } = createHost();

    filter.catch(new Error('boom'), host);

    const body = json.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).toHaveProperty('requestId');
    expect(typeof body.requestId).toBe('string');
  });

  it('never leaks a raw non-HttpException message to the client', () => {
    const { host, json } = createHost('req-4');

    filter.catch(new Error('SECRET-LEAK-SENTINEL'), host);

    const body = JSON.stringify(json.mock.calls[0]?.[0]);
    expect(body).not.toContain('SECRET-LEAK-SENTINEL');
  });

  it('never leaks a thrown non-Error value to the client', () => {
    const { host, json } = createHost('req-5');

    filter.catch('SECRET-LEAK-SENTINEL-2', host);

    const body = JSON.stringify(json.mock.calls[0]?.[0]);
    expect(body).not.toContain('SECRET-LEAK-SENTINEL-2');
  });

  // `body-parser` runs ahead of the Nest pipeline and throws `http-errors`
  // objects rather than `HttpException`s. Mapping those to 500 would break
  // the guarantee that no client input can produce a server error.
  it('preserves the status of an http-errors style client error', () => {
    const { host, json, status } = createHost('req-6');
    const payloadTooLarge = Object.assign(
      new Error('request entity too large'),
      {
        status: 413,
        statusCode: 413,
        expose: true,
      },
    );

    filter.catch(payloadTooLarge, host);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'request entity too large',
      requestId: 'req-6',
    });
  });

  it('hides the message of a non-exposed http-errors client error', () => {
    const { host, json, status } = createHost('req-7');
    const hidden = Object.assign(new Error('INTERNAL-DETAIL-SENTINEL'), {
      status: 400,
      expose: false,
    });

    filter.catch(hidden, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain(
      'INTERNAL-DETAIL-SENTINEL',
    );
  });

  it('does not trust a 5xx carried by a non-HttpException', () => {
    const { host, json, status } = createHost('req-8');
    const serverError = Object.assign(new Error('DB-DSN-SENTINEL'), {
      status: 503,
      expose: true,
    });

    filter.catch(serverError, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toContain(
      'DB-DSN-SENTINEL',
    );
  });
});
