/**
 * Raised when a raw request body violates an RFC 8785 / RFC 7493 input
 * constraint that is no longer observable once the JSON has been parsed.
 */
export class StrictJsonBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrictJsonBodyError';
  }
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Enforces the two RFC 8785 input constraints that `canonicalize` cannot
 * check for itself, because both are erased by `JSON.parse` before any
 * JavaScript value exists:
 *
 * 1. **Valid UTF-8.** RFC 8785 §1 requires I-JSON (RFC 7493) input, which
 *    mandates UTF-8. `Buffer.prototype.toString('utf8')` is lenient: it
 *    replaces malformed byte sequences with U+FFFD, so an invalid body
 *    would be silently mutated into a valid-looking one and signed as if
 *    the client had sent replacement characters.
 *
 * 2. **No duplicate property names.** RFC 8785 §3.1: "JSON objects MUST NOT
 *    exhibit duplicate property names." Node's `JSON.parse` accepts them
 *    and keeps the last occurrence, which means `{"a":1,"a":2}` and
 *    `{"a":2}` would receive the same signature — the client and the
 *    service would disagree about what was signed, which is exactly the
 *    ambiguity JCS exists to remove.
 *
 * Deliberately *not* a full JSON validator: it runs after the body parser,
 * so the input is already known to be well-formed JSON. It only needs
 * enough of the grammar to tell a property name apart from a string that
 * merely looks like one (a value such as `"{\"a\":1,\"a\":2}"` must not
 * trigger a false positive).
 *
 * The scan is iterative rather than recursive: a 100kb body can nest far
 * deeper than the call stack tolerates, and a stack overflow here would
 * surface as a 500 — which the error-handling contract forbids for any
 * client input.
 *
 * @throws {StrictJsonBodyError}
 */
export function assertStrictJsonBody(raw: Buffer): void {
  let text: string;
  try {
    text = utf8Decoder.decode(raw);
  } catch {
    throw new StrictJsonBodyError('Request body is not valid UTF-8');
  }

  assertNoDuplicateKeys(text);
}

/**
 * Container being scanned. Arrays carry no key set: only objects can
 * exhibit duplicate property names.
 */
type Container = { readonly keys: Set<string> } | null;

function assertNoDuplicateKeys(text: string): void {
  const stack: Container[] = [];
  // True when the next string token to appear is a property name rather
  // than a value: right after `{`, and right after a `,` inside an object.
  let expectKey = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    switch (char) {
      case '{':
        stack.push({ keys: new Set<string>() });
        expectKey = true;
        index += 1;
        break;

      case '[':
        stack.push(null);
        expectKey = false;
        index += 1;
        break;

      case '}':
      case ']':
        stack.pop();
        // Whatever container we just returned into, the token that follows
        // is a `,`, a closing bracket, or the end of input — never a key.
        expectKey = false;
        index += 1;
        break;

      case ',': {
        // A comma introduces a property name only inside an object.
        const current = stack[stack.length - 1];
        expectKey = current != null;
        index += 1;
        break;
      }

      case ':':
        expectKey = false;
        index += 1;
        break;

      case '"': {
        const { value, end } = readString(text, index);
        if (expectKey) {
          // Non-null because `expectKey` is only ever set inside an object.
          const current = stack[stack.length - 1] as { keys: Set<string> };
          if (current.keys.has(value)) {
            throw new StrictJsonBodyError(
              'Request body contains duplicate property names',
            );
          }
          current.keys.add(value);
          expectKey = false;
        }
        index = end;
        break;
      }

      default:
        // Whitespace, numbers, `true`, `false`, `null`: nothing that can
        // affect key tracking, so a single-character step is enough.
        index += 1;
        break;
    }
  }
}

const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

/**
 * Reads the JSON string starting at `start` (which must point at the
 * opening quote) and returns its **decoded** value plus the index just past
 * the closing quote.
 *
 * Decoding matters for duplicate detection: `{"a":1,"a":2}` holds the
 * same property name twice even though the two tokens differ character for
 * character. Comparing raw token text would miss it.
 *
 * The input is already known to be well-formed JSON (the body parser ran
 * first), so no error branch is needed for a truncated escape or an
 * unterminated string.
 */
function readString(
  text: string,
  start: number,
): { value: string; end: number } {
  let value = '';
  let index = start + 1;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      return { value, end: index + 1 };
    }

    if (char === '\\') {
      const escape = text[index + 1] as string;

      if (escape === 'u') {
        // `\uXXXX` — kept as a single code unit, so a surrogate pair spelled
        // as two escapes decodes to the same string as its literal form.
        value += String.fromCharCode(
          Number.parseInt(text.slice(index + 2, index + 6), 16),
        );
        index += 6;
        continue;
      }

      value += SHORT_ESCAPES[escape] ?? escape;
      index += 2;
      continue;
    }

    value += char;
    index += 1;
  }

  return { value, end: index };
}
