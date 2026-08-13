/**
 * Raised when a value cannot be canonicalized under RFC 8785 (JCS).
 *
 * The RFC does not describe these situations as "best effort" cases: it
 * requires a compliant implementation to *terminate with an error* — see
 * RFC 8785 §3.2.2.3 ("Occurrences of NaN or Infinity MUST cause a compliant
 * JCS implementation to terminate with an appropriate error") and §3.2.2.2
 * (same requirement for lone surrogates). Producing a canonical string
 * anyway would mean signing a payload whose canonical form does not
 * round-trip, which is precisely what JCS exists to prevent.
 *
 * Deliberately a plain `Error` with no NestJS dependency: `common/json` is a
 * pure serialization module usable outside an HTTP context. The translation
 * into a 400 response happens at the domain boundary
 * (`SignatureService`), not here.
 */
export class JsonCanonicalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonCanonicalizationError';
  }
}
