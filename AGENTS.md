# AGENTS.md

Guidance for agents working in this repository.

## Stack

NestJS 11 on Node >= 22 (see `.nvmrc`), TypeScript in `strict` mode with
`noUncheckedIndexedAccess`, `noImplicitOverride` and `exactOptionalPropertyTypes`.
Package manager: pnpm. No `any`, no `@ts-ignore`. Cryptography comes from
`node:crypto` only — do not add a third-party crypto dependency.

## Architecture

Ports & adapters. Requests flow in one direction:

```
controller  ->  service (domain)  ->  port (interface)  ->  adapter (algorithm)
```

- **controller** — HTTP only: routing, status codes, Swagger. No business logic.
- **service** — the domain. Depends on ports, never on a concrete algorithm.
- **port** — an interface plus its DI token (`CIPHER`, `SIGNER`).
- **adapter** — one concrete implementation of a port.

A module binds a port to an adapter, and that binding is the only place an
algorithm is named:

```ts
{ provide: CIPHER, useClass: Base64Cipher }
```

Swapping an algorithm must require changing that single line and nothing else.
If a change forces you to touch a service or a controller to swap an
implementation, the abstraction is wrong — fix the abstraction.

```
src/
  common/        cross-cutting: filters, interceptors, pipes, json canonicalization
  config/        env schema (zod), validated fail-fast at startup
  crypto/        /encrypt, /decrypt      ports/ adapters/ dto/ test/
  signature/     /sign, /verify          ports/ adapters/ dto/ test/
  health/        /health
  testing/       shared test helpers (excluded from the build)
test/            e2e
```

## Tests

Every change ships with tests. Three levels, three locations:

| Level | Location | Scope |
|---|---|---|
| Unit | `src/**/*.test.ts`, next to the file under test | One unit, dependencies faked |
| Integration | `src/<domain>/test/*.integration.test.ts` | Real Nest app via `createTestApp`, one domain, real HTTP |
| E2E | `test/*.e2e.test.ts` | Full app, endpoints chained end to end |

Rules:

- Unit and integration tests are required. Add an e2e test only when the
  behaviour spans several endpoints — an e2e test chains real calls and must
  never hardcode an intermediate value produced by a previous call.
- Write the test first, watch it fail, and check it fails because the feature
  is missing — not because of a typo or a bad import. Then implement.
- Never weaken a test or a lint rule to get to green.
- Adapters are covered by contract suites (`*.contract.test.ts`) run with
  `describe.each` against every implementation of the port.
- Property-based tests use a pinned fast-check seed so runs are reproducible.

## Commands

Prefix with `source ~/.nvm/nvm.sh && nvm use &&` if your shell defaults to an
older Node.

```bash
pnpm install

pnpm test              # the three suites, in order
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:cov          # coverage, reported but not gating
pnpm test:watch

pnpm lint              # reports; never mutates
pnpm lint:fix
pnpm typecheck
pnpm build
pnpm start:dev
```

Before committing: `pnpm lint && pnpm typecheck && pnpm test`.

`HMAC_SECRET` (>= 32 characters) must be set or the app refuses to start. Copy
`.env.example` to `.env`. Never commit `.env`, and never let the secret reach a
log, an error body, or the OpenAPI document.

## Comments

Comment only when the code cannot speak for itself. A comment is justified when
the code is **complex**, **ambiguous**, or encodes a **product or design
decision** — and then it explains *why*, not *what*.

Delete anything that restates the declaration below it: no "port for the
encryption algorithm" above a port, no "domain service" above a service, no
"integration tests for POST /encrypt" above `describe('POST /encrypt')`. A short
one-line summary is fine when a name is genuinely not self-explanatory.

Do not cite internal documents (`docs/cahier-des-charges.md`, section numbers).
State the rule itself, in plain English, so the comment stands on its own.

Worth a comment:

```ts
// Plain assignment hits the Object.prototype setter for the key "__proto__"
// and silently drops the property, breaking decrypt(encrypt(x)) === x.
Object.defineProperty(target, key, { value, enumerable: true, ... });
```

Not worth a comment:

```ts
// Returns the user id.
function getUserId() { ... }
```

Comments are written in English.
