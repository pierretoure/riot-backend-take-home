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

## Known limitations

- **The Base64 detection heuristic is irreducibly ambiguous.** A plaintext string that happens to be simultaneously valid Base64, valid UTF-8, and valid JSON (e.g. the literal string `"MzA="` sent as a property value) is indistinguishable from genuine ciphertext and will be decoded by `/decrypt` regardless of intent. Nothing short of an explicit format marker (e.g. an `enc:v1:` envelope, as demonstrated for illustration only in `RotCipher`) can remove this ambiguity, and adding one to `Base64Cipher` would deviate from the subject's literal Base64 output format — so it is left as a documented trade-off rather than "fixed".
- **No Unicode NFC normalization in `canonicalize`**, unlike strict RFC 8785 (JCS). Two different Unicode representations of the same perceived character (e.g. precomposed vs. combining-mark form) produce two different canonical strings and therefore two different signatures. Accepted here because the signer and verifier are the same service and there is no cross-system normalization boundary.
- **A single HMAC secret, with no rotation mechanism.** Changing `SIGNER_SECRET` invalidates every signature issued under the previous one; there is no key ID or multi-key verification.
- **Encryption only ever applies at depth 1**, per the subject: nested objects are encrypted as a single opaque Base64 blob, not recursively per leaf.
- **`RotCipher` is provided as an example only and should not be used in production.**

## Possible extensions

- HMAC key rotation (key IDs, multi-secret verification window).
- Asymmetric signing (e.g. Ed25519) so verification doesn't require holding the signing secret.
- Recursive encryption below depth 1, for nested objects that should not be encrypted as a single opaque blob.

## References

- [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) — internal specification derived from the challenge.
- [`docs/subject.md`](docs/subject.md) — original challenge statement.
