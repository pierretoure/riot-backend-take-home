# Riot Backend Take-Home

HTTP API exposing four endpoints — `POST /encrypt`, `POST /decrypt`, `POST /sign`, `POST /verify` — for encrypting, decrypting, signing and verifying arbitrary JSON payloads, per the original challenge statement in [`docs/subject.md`](docs/subject.md). The full internal specification derived from it is [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Quick start

**Requirements**

- Node 22 is required (`22.23.1`)
- We recommand using`pnpm` as the package manager (`pnpm@10.12.1`).
- The process needs a valid `SIGNER_SECRET` in `.env` to start (see [Environment variables](#environment-variables)).

### Local

Install + define environment variables

```bash
nvm use
pnpm install
cp .env.example .env   # then edit SIGNER_SECRET (>= 32 characters)
```

Run locally

```bash
pnpm start:dev
```

The app listens on `http://localhost:3000` (you can update `PORT` in `.env`). Swagger UI is at `/docs`.

### Docker

Define environment variables

```bash
cp .env.example .env   # then edit SIGNER_SECRET (>= 32 characters)
```

Build and run the image

```bash
docker compose up --build
```

## Environment variables

Any invalid value throws before the app starts listening.

| Variable        | Required | Default       | Constraint                                                 |
| --------------- | -------- | ------------- | ---------------------------------------------------------- |
| `SIGNER_SECRET` | yes      | —             | string, >= 32 characters                                   |
| `PORT`          | no       | `3000`        | integer, 1–65535                                           |
| `NODE_ENV`      | no       | `development` | one of `development`, `test`, `production`                 |
| `LOG_LEVEL`     | no       | `log`         | one of `fatal`, `error`, `warn`, `log`, `debug`, `verbose` |

### Generating a `SIGNER_SECRET`

```bash
openssl rand -hex 16
```

It prints a 32-character hex string. OpenSSL ships with macOS and most Linux
distributions; on Windows it comes with [Git for Windows](https://git-scm.com/download/win)
(use Git Bash), or see the [OpenSSL binaries page](https://openssl-library.org/source/)
for a standalone install.

## Tests

```bash
pnpm test:unit          # unit tests, colocated *.test.ts files
pnpm test:integration   # integration tests, src/<domain>/test/*.integration.test.ts
pnpm test:e2e           # end-to-end tests, test/*.e2e.test.ts
pnpm test               # runs the three suites above, in that order
pnpm test:cov           # full suite with coverage report
```

You can also run `pnpm lint` (ESLint) and `pnpm typecheck` (`tsc --noEmit`).

## Architecture

```
HTTP  ──►  Controllers (routes, HTTP codes, Swagger, request parsing)
             │  no business logic
             ▼
           Services (domain logic: payload traversal, orchestration)
             │  depend only on port interfaces
             ▼
           Adapters (concrete implementations: Base64, HMAC-SHA256)
```

## Signing and RFC 8785

`/sign` and `/verify` compute the HMAC over the canonical form of the payload, so
the signature depends on the JSON _value_ and not on how it was written. That
canonical form follows [RFC 8785 (JCS)](https://datatracker.ietf.org/doc/html/rfc8785):
keys sorted by UTF-16 code unit at every level, no insignificant whitespace,
ECMAScript number formatting, minimal string escaping, UTF-8 output. The RFC's
own sorting test vector is replayed in the unit suite.

Where the RFC requires an implementation to _fail_ rather than produce output,
these two routes return **400** instead of signing something ambiguous:

| Input                                                               | Why it is rejected                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Duplicate property names (`{"a":1,"a":2}`)                          | RFC 8785 §3.1. `JSON.parse` silently keeps the last one, so it would sign the same bytes as `{"a":2}` |
| Invalid UTF-8 in the request body                                   | I-JSON (RFC 7493). Lenient decoding would substitute U+FFFD and sign a payload the client never sent  |
| `NaN` / `Infinity` (e.g. `{"a":1e400}`, which parses to `Infinity`) | RFC 8785 §3.2.2.3. `JSON.stringify` would emit `null` instead                                         |
| Lone surrogates (e.g. `"\ud800"`)                                   | RFC 8785 §3.2.2.2. Not encodable as UTF-8, so there is no canonical byte sequence                     |

These checks are scoped to `/sign` and `/verify`. `/encrypt` and `/decrypt` never
canonicalize, so they keep accepting any body `JSON.parse` accepts.

## Known limitations

- **The Base64 detection heuristic is irreducibly ambiguous.** A plaintext string that happens to be simultaneously valid Base64, valid UTF-8, and valid JSON (e.g. the literal string `"MzA="` sent as a property value) is indistinguishable from genuine ciphertext and will be decoded by `/decrypt` regardless of intent. Nothing short of an explicit format marker (e.g. an `enc:v1:` envelope) can remove this ambiguity, and adding one to `Base64Cipher` would deviate from the subject's literal Base64 output format — so it is left as a documented trade-off rather than "fixed".
- **Two Unicode spellings of the same perceived character sign differently.** This is specified behaviour rather than a shortcut: RFC 8785 (JCS) places Unicode normalization out of scope and requires that "all components involved MUST preserve Unicode string data 'as is'". A precomposed `é` (U+00E9) and its decomposed form (U+0065 U+0301) are therefore different data, and normalizing them here would be a violation of the spec, not an improvement. Clients that need the two forms to be interchangeable must normalize before signing.
- **A single HMAC secret, with no rotation mechanism.** Changing `SIGNER_SECRET` invalidates every signature issued under the previous one; there is no key ID or multi-key verification.
- **Encryption only ever applies at depth 1**, per the subject: nested objects are encrypted as a single opaque Base64 blob, not recursively per leaf.

## Possible extensions

- HMAC key rotation (key IDs, multi-secret verification window).
- Asymmetric signing (e.g. Ed25519) so verification doesn't require holding the signing secret.
- Recursive encryption below depth 1, for nested objects that should not be encrypted as a single opaque blob.

## References

- [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) — internal specification derived from the challenge.
- [`docs/subject.md`](docs/subject.md) — original challenge statement.
