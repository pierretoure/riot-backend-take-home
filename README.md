# Riot Backend Take-Home

HTTP API exposing four endpoints — `POST /encrypt`, `POST /decrypt`, `POST /sign`, `POST /verify` — for encrypting, decrypting, signing and verifying arbitrary JSON payloads, per the original challenge statement in [`docs/subject.md`](docs/subject.md). The full internal specification derived from it is [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Quick start

**Requirements**

- Node 22 is required (`22.23.1`)
- We recommand using`pnpm` as the package manager (`pnpm@10.12.1`).
- The process needs a valid `SIGNER_SECRET` in `.env` to start (see [Environment variables](#environment-variables) and [Generating a `SIGNER_SECRET`](#generating-a-signer_secret)).

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

## Possible extensions

- HMAC key rotation (key IDs, multi-secret verification window).
- Asymmetric signing (e.g. Ed25519) so verification doesn't require holding the signing secret.
- Recursive encryption below depth 1, for nested objects that should not be encrypted as a single opaque blob.

## References

- [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md) — internal specification derived from the challenge.
- [`docs/subject.md`](docs/subject.md) — original challenge statement.
