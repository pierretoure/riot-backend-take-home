import {
  StrictJsonBodyError,
  assertStrictJsonBody,
} from './assert-strict-json-body';

const body = (json: string): Buffer => Buffer.from(json, 'utf8');

describe('assertStrictJsonBody', () => {
  describe('duplicate property names (RFC 8785 §3.1)', () => {
    it.each([
      ['at the root', '{"a":1,"a":2}'],
      ['inside a nested object', '{"outer":{"a":1,"b":2,"a":3}}'],
      ['inside an object nested in an array', '[{"a":1},{"b":1,"b":2}]'],
      ['separated by other properties', '{"a":1,"b":2,"c":3,"a":4}'],
      ['with object values in between', '{"a":{"x":1},"b":2,"a":{"x":2}}'],
      ['for the empty-string name', '{"":1,"":2}'],
    ])('rejects a duplicate %s', (_label, json) => {
      // Sanity check: Node accepts all of these and keeps the last value,
      // which is exactly the ambiguity being rejected here.
      expect(() => {
        JSON.parse(json);
      }).not.toThrow();

      expect(() => assertStrictJsonBody(body(json))).toThrow(
        StrictJsonBodyError,
      );
    });

    it('rejects a duplicate spelled with an escape sequence', () => {
      // The escaped form of the letter "a" names the same property as the
      // literal one, even though the two tokens differ character for
      // character — which is why detection compares decoded names.
      expect(() => assertStrictJsonBody(body('{"a":1,"\\u0061":2}'))).toThrow(
        StrictJsonBodyError,
      );
    });

    it('rejects a duplicate whose name contains an escaped quote', () => {
      expect(() => assertStrictJsonBody(body('{"a\\"b":1,"a\\"b":2}'))).toThrow(
        StrictJsonBodyError,
      );
    });

    it.each([
      ['the same name in two sibling objects', '{"x":{"a":1},"y":{"a":2}}'],
      ['the same name at two nesting levels', '{"a":{"a":{"a":1}}}'],
      ['the same name in two array elements', '[{"a":1},{"a":2}]'],
      [
        'a string value that looks like a duplicated object',
        '{"a":"{\\"b\\":1,\\"b\\":2}"}',
      ],
      [
        'a string value containing a colon and a comma',
        '{"a":"b\\":1,\\"b","c":2}',
      ],
      ['a property name equal to a sibling value', '{"a":"b","b":1}'],
      ['an empty object and an empty array', '{"a":{},"b":[]}'],
      ['nothing but a scalar root', '42'],
    ])('accepts %s', (_label, json) => {
      expect(() => assertStrictJsonBody(body(json))).not.toThrow();
    });

    it('accepts the literal examples from the subject', () => {
      expect(() =>
        assertStrictJsonBody(
          body('{"message":"Hello World","timestamp":1616161616}'),
        ),
      ).not.toThrow();
    });

    it('handles nesting deeper than the call stack tolerates', () => {
      // The scan must stay iterative: a stack overflow on client input would
      // surface as a 500, which the error-handling contract forbids.
      const depth = 50_000;
      const json = `${'['.repeat(depth)}1${']'.repeat(depth)}`;

      expect(() => assertStrictJsonBody(body(json))).not.toThrow();
    });
  });

  describe('UTF-8 validity (RFC 7493 via RFC 8785 §1)', () => {
    it('rejects a body containing a malformed byte sequence', () => {
      // 0xFF never appears in valid UTF-8. `Buffer.toString('utf8')` would
      // quietly turn it into U+FFFD and sign the replacement character.
      const invalid = Buffer.concat([
        Buffer.from('{"a":"', 'utf8'),
        Buffer.from([0xff]),
        Buffer.from('"}', 'utf8'),
      ]);

      expect(() => assertStrictJsonBody(invalid)).toThrow(StrictJsonBodyError);
    });

    it('rejects a truncated multi-byte sequence', () => {
      // First two bytes of the three-byte encoding of U+20AC.
      const invalid = Buffer.concat([
        Buffer.from('{"a":"', 'utf8'),
        Buffer.from([0xe2, 0x82]),
        Buffer.from('"}', 'utf8'),
      ]);

      expect(() => assertStrictJsonBody(invalid)).toThrow(StrictJsonBodyError);
    });

    it('accepts valid multi-byte characters', () => {
      expect(() =>
        assertStrictJsonBody(body('{"€":"café","emoji":"😀"}')),
      ).not.toThrow();
    });
  });
});
