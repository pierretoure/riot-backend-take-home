# Riot Backend Take-Home

HTTP API exposing four endpoints — `POST /encrypt`, `POST /decrypt`, `POST /sign`, `POST /verify` — for encrypting, decrypting, signing and verifying arbitrary JSON payloads, per the original challenge statement in [`docs/subject.md`](docs/subject.md). The full internal specification derived from it is [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Quick start

Node 22 is required (`.nvmrc` pins `22.23.1`); `pnpm` is the package manager (`pnpm@10.12.1`, pinned via `corepack` in the `Dockerfile`).

### Local

```bash
nvm use
pnpm install
cp .env.example .env   # then edit HMAC_SECRET (>= 32 characters)
pnpm start:dev
```

The app listens on `http://localhost:3000` (`PORT` in `.env`). Swagger UI is at `/docs`, the raw OpenAPI document at `/docs-json`, and a liveness probe at `GET /health`.

### Docker

```bash
cp .env.example .env   # then edit HMAC_SECRET (>= 32 characters)
docker compose up --build
```

This builds the multi-stage image (`deps` → `build` → `prod-deps` → `runtime`), reads `.env` via `docker-compose.yml`, and exposes the app on `${PORT:-3000}`. The container runs as a non-root user and reports its own health via the `HEALTHCHECK` on `/health`.

Both paths were run end-to-end while writing this README: `pnpm start:dev` served real traffic on `:3000`, and `docker compose up --build` produced a container reported as `healthy` by `docker compose ps`, responding `200 {"status":"ok"}` on `GET /health`.

In both cases, without a valid `HMAC_SECRET` the process refuses to start (see [Environment variables](#environment-variables)).

## Environment variables

Validated at startup by `src/config/env.schema.ts` (`zod`), via the `validate` option of `ConfigModule.forRoot()`. Any invalid value throws before the app starts listening — no request is ever handled by an unconfigured instance.

| Variable | Required | Default | Constraint |
|---|---|---|---|
| `HMAC_SECRET` | yes | — | string, >= 32 characters |
| `PORT` | no | `3000` | integer, 1–65535 |
| `NODE_ENV` | no | `development` | one of `development`, `test`, `production` |
| `LOG_LEVEL` | no | `info` | one of `fatal`, `error`, `warn`, `info`, `debug`, `trace` |

`.env.example` is versioned as a template; `.env` is git-ignored and must never be committed. There is no default secret anywhere in the code — a missing or too-short `HMAC_SECRET` is a fail-fast startup error, not a runtime `500`.

## API examples

All examples below were run against a local `pnpm start:dev` instance; the responses shown are the actual output, not illustrations.

### `POST /encrypt`

```bash
curl -s -X POST http://localhost:3000/encrypt \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "John Doe",
    "age": 30,
    "contact": {
      "email": "john@example.com",
      "phone": "123-456-7890"
    }
  }'
```

```json
{"name":"IkpvaG4gRG9lIg==","age":"MzA=","contact":"eyJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJwaG9uZSI6IjEyMy00NTYtNzg5MCJ9"}
```

### `POST /decrypt`

Feeding the `/encrypt` output straight back in restores the original payload, types included (`30` comes back as a `number`, not `"30"`):

```bash
curl -s -X POST http://localhost:3000/decrypt \
  -H 'Content-Type: application/json' \
  -d '{"name":"IkpvaG4gRG9lIg==","age":"MzA=","contact":"eyJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJwaG9uZSI6IjEyMy00NTYtNzg5MCJ9"}'
```

```json
{"name":"John Doe","age":30,"contact":{"email":"john@example.com","phone":"123-456-7890"}}
```

An unencrypted property is passed through unchanged:

```bash
curl -s -X POST http://localhost:3000/decrypt \
  -H 'Content-Type: application/json' \
  -d '{"name":"IkpvaG4gRG9lIg==","age":"MzA=","contact":"eyJlbWFpbCI6ImpvaG5AZXhhbXBsZS5jb20iLCJwaG9uZSI6IjEyMy00NTYtNzg5MCJ9","birth_date":"1998-11-19"}'
```

```json
{"name":"John Doe","age":30,"contact":{"email":"john@example.com","phone":"123-456-7890"},"birth_date":"1998-11-19"}
```

`birth_date` is not valid Base64 (it contains `-` and has length 10, not a multiple of 4), so it fails the first detection criterion and is left exactly as received.

### `POST /sign`

```bash
curl -s -X POST http://localhost:3000/sign \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hello World","timestamp":1616161616}'
```

```json
{"signature":"dda8970fef0ef75979ae93f2fcd73844582c653aef5c2dbc0f70eec9d72a966d"}
```

Reordering the top-level properties yields the exact same signature:

```bash
curl -s -X POST http://localhost:3000/sign \
  -H 'Content-Type: application/json' \
  -d '{"timestamp":1616161616,"message":"Hello World"}'
```

```json
{"signature":"dda8970fef0ef75979ae93f2fcd73844582c653aef5c2dbc0f70eec9d72a966d"}
```

### `POST /verify`

Valid signature, key order changed in `data` — still `204 No Content`:

```bash
curl -s -X POST http://localhost:3000/verify \
  -H 'Content-Type: application/json' \
  -d '{"signature":"dda8970fef0ef75979ae93f2fcd73844582c653aef5c2dbc0f70eec9d72a966d","data":{"timestamp":1616161616,"message":"Hello World"}}' \
  -w '\nSTATUS:%{http_code}\n'
```

```
STATUS:204
```

Tampered data (same signature, `message` changed) — `400 Bad Request`:

```bash
curl -s -X POST http://localhost:3000/verify \
  -H 'Content-Type: application/json' \
  -d '{"signature":"dda8970fef0ef75979ae93f2fcd73844582c653aef5c2dbc0f70eec9d72a966d","data":{"timestamp":1616161616,"message":"Goodbye World"}}' \
  -w '\nSTATUS:%{http_code}\n'
```

```json
{"statusCode":400,"error":"Bad Request","message":"Signature is invalid","requestId":"1d19800a-1ed3-49cf-b349-c546b6beabd4"}
```
```
STATUS:400
```

## Tests

```bash
pnpm test:unit          # unit tests, colocated *.test.ts files
pnpm test:integration   # integration tests, src/<domain>/test/*.integration.test.ts
pnpm test:e2e           # end-to-end tests, test/*.e2e.test.ts
pnpm test               # runs the three suites above, in that order
pnpm test:cov           # full suite with coverage report
```

Measured on this checkout:

| Suite | Scope | Result |
|---|---|---|
| Unit | `canonicalize`, `Base64Cipher`/`RotCipher` (incl. shared `Cipher` contract), `HmacSha256Signer`, `CryptoService`, `SignatureService`, exception filter, logging interceptor, env schema — plus property-based tests (`fast-check`) for round-trip and canonicalization invariants | 14 suites, 121 tests passing |
| Integration | The 4 routes on a real Nest application (Supertest): the subject's literal examples, key-order invariance on `/sign`/`/verify`, tampered payload → `400`, error-case table (malformed JSON, wrong `Content-Type`, non-object root, missing `/verify` fields, oversized body) | 9 suites, 51 tests passing |
| End-to-end | Multi-request flows: `POST /encrypt` → `POST /decrypt` restores the original payload (types included); `POST /sign` → `POST /verify` returns `204`, with no value hard-coded between the two calls | 2 suites, 12 tests passing |

Total: 184 tests, all passing. `pnpm test:cov` reports 97.8% statement coverage / 97.57% line coverage / 89.24% branch coverage / 98.03% function coverage across `src/`. Coverage is reported for information only — it is not a CI gate (see `.github/workflows/ci.yml`); the three test suites are the actual gates, run with `--ci --passWithNoTests=false` so an empty or skipped suite fails the build instead of passing silently.

`pnpm lint` (ESLint) and `pnpm typecheck` (`tsc --noEmit`) are both clean on this checkout.

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

The domain layer (`CryptoService`, `SignatureService`) only knows two interfaces:

```ts
// src/crypto/ports/cipher.port.ts
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  looksEncrypted(value: string): boolean;
}

// src/signature/ports/signer.port.ts
export interface Signer {
  sign(payload: string): string;
  verify(payload: string, signature: string): boolean;
}
```

`CryptoModule`/`SignatureModule` bind a token to a concrete class through Nest's DI container:

```ts
// src/crypto/crypto.module.ts
providers: [{ provide: CIPHER, useClass: Base64Cipher }, CryptoService],
```

**To switch encryption algorithm, change exactly this line** — e.g. `useClass: RotCipher`. `CryptoService` and `CryptoController` are untouched. `src/crypto/adapters/rot.cipher.ts` is a second, fully working `Cipher` implementation kept unused in production for exactly this purpose: `src/crypto/adapters/cipher.contract.test.ts` runs the same behavioural contract suite (`describe.each`) against both `Base64Cipher` and `RotCipher`, proving the abstraction holds rather than merely asserting it. The same pattern applies to `Signer` in `src/signature/signature.module.ts`.

## Design decisions

- **`JSON.stringify` on every encrypted value, strings included.** `/encrypt` always computes `cipher.encrypt(JSON.stringify(value))`, never `cipher.encrypt(value)` directly. This is what lets `/decrypt` restore the original type: `30` round-trips as a `number`, `"John Doe"` as a `string`, `null` as `null`, not everything collapsing to `string`.

- **Four-criterion heuristic in `Base64Cipher.looksEncrypted`** (`src/crypto/adapters/base64.cipher.ts`), all required: (1) the value matches the Base64 alphabet and its length is a multiple of 4; (2) round-tripping the decoded bytes through `base64Encode` reproduces the exact input (rejects non-canonical padding); (3) the decoded bytes are strictly valid UTF-8, checked with `TextDecoder('utf-8', { fatal: true })` rather than `Buffer#toString('utf8')`, because the latter silently replaces invalid sequences with `U+FFFD` instead of rejecting them; (4) the decoded text parses as JSON. Since `/encrypt` always wraps values in `JSON.stringify`, genuine ciphertext always satisfies (4); this is what lets `/decrypt` tell real ciphertext from a plain string like `birth_date` apart.

- **Manual JSON canonicalization instead of re-sorting an object and calling `JSON.stringify`** (`src/common/json/canonicalize.ts`). ECMAScript mandates that object keys resembling array indices (`"1"`, `"2"`, `"10"`) be enumerated in ascending numeric order regardless of insertion order — a behavior `Object.keys`/`JSON.stringify` inherit. Building a plain object with keys re-inserted in sorted order and serializing it would silently undo the sort for numeric-like keys (`{"1","10","2"}` would come back out as `{"1","2","10"}`). `canonicalize` instead assembles `{...}`/`[...]` strings by hand from an explicitly sorted key array, sidestepping the engine's key-ordering rule entirely; primitives still go through `JSON.stringify` for their literal representation.

- **Constant-time signature comparison.** `HmacSha256Signer.verify` (`src/signature/adapters/hmac-sha256.signer.ts`) uses `crypto.timingSafeEqual`, preceded by a length check (which `timingSafeEqual` itself would throw on rather than treat as "not equal"). A plain `===`/`Buffer.equals` comparison is deliberately avoided to prevent timing side-channels on the signature bytes.

- **No `class-validator`/`class-transformer`.** Three of the four routes accept arbitrary JSON. The global `ValidationPipe` runs with `whitelist: true`, which strips any property not declared on a DTO class — fine for fixed-shape DTOs, but it would collapse an arbitrary-JSON body down to `{}` for these routes. Bodies are instead typed as plain TypeScript interfaces (Nest sees their reflected metatype as `Object` and the pipe leaves them alone) and validated explicitly (`parseSignRequest`, `parseVerifyRequest`, and their `crypto` counterparts), each throwing `BadRequestException` on invalid shape. The global `ValidationPipe` stays in place for any future fixed-shape DTO.

## Known limitations

- **The Base64 detection heuristic is irreducibly ambiguous.** A plaintext string that happens to be simultaneously valid Base64, valid UTF-8, and valid JSON (e.g. the literal string `"MzA="` sent as a property value) is indistinguishable from genuine ciphertext and will be decoded by `/decrypt` regardless of intent. Nothing short of an explicit format marker (e.g. an `enc:v1:` envelope, as demonstrated for illustration only in `RotCipher`) can remove this ambiguity, and adding one to `Base64Cipher` would deviate from the subject's literal Base64 output format — so it is left as a documented trade-off rather than "fixed".
- **No Unicode NFC normalization in `canonicalize`**, unlike strict RFC 8785 (JCS). Two different Unicode representations of the same perceived character (e.g. precomposed vs. combining-mark form) produce two different canonical strings and therefore two different signatures. Accepted here because the signer and verifier are the same service and there is no cross-system normalization boundary.
- **A single HMAC secret, with no rotation mechanism.** Changing `HMAC_SECRET` invalidates every signature issued under the previous one; there is no key ID or multi-key verification.
- **Encryption only ever applies at depth 1**, per the subject: nested objects are encrypted as a single opaque Base64 blob, not recursively per leaf.
- **`RotCipher`'s `looksEncrypted` is a bare prefix check** (`rot13:`) — deliberately weaker than `Base64Cipher`'s heuristic, since it exists solely to demonstrate that the `Cipher` port can be satisfied by a structurally different algorithm, not to be production-grade.

## Possible extensions

- HMAC key rotation (key IDs, multi-secret verification window).
- Asymmetric signing (e.g. Ed25519) so verification doesn't require holding the signing secret.
- Recursive encryption below depth 1, for nested objects that should not be encrypted as a single opaque blob.

## References

- [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) — internal specification derived from the challenge.
- [`docs/subject.md`](docs/subject.md) — original challenge statement.
