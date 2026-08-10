import { BadRequestException } from '@nestjs/common';
import { JsonPayloadPipe } from './json-payload.pipe';

describe('JsonPayloadPipe', () => {
  let pipe: JsonPayloadPipe;

  beforeEach(() => {
    pipe = new JsonPayloadPipe();
  });

  it('passes through a plain JSON object unchanged', () => {
    const body = { name: 'John Doe', age: 30 };
    expect(pipe.transform(body)).toBe(body);
  });

  it('accepts an empty object', () => {
    expect(pipe.transform({})).toEqual({});
  });

  it.each([
    ['undefined (no/unparseable body)', undefined],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['a string', 'hello'],
    ['a number', 42],
    ['a boolean', true],
  ])('rejects %s as a non-object root', (_label, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
