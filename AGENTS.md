# AGENTS.md

## Commands

Use **pnpm**, never npm. If your shell defaults to an older Node, prefix with
`source ~/.nvm/nvm.sh && nvm use &&`.

```bash
pnpm install
pnpm start:dev

pnpm test                                    # the three suites, in order
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:unit --testPathPatterns=canonicalize   # one file
pnpm test:unit -t "never pollutes Object.prototype"   # one test by name

pnpm lint          # reports only; lint:fix mutates
pnpm typecheck
pnpm build
```

**YOU MUST run `pnpm lint && pnpm typecheck && pnpm test` before considering a
task finished.** No git hook enforces this locally — only CI, after you push.

Do not write `pnpm test:unit -- --testPathPatterns=x`: the `--` makes Jest read
the flag as a literal path pattern, and the run dies with a misleading
`No tests found`.

## Environment

`HMAC_SECRET` (>= 32 characters) must be set or the app refuses to start — copy
`.env.example` to `.env`. Never commit `.env`, and never let the secret reach a
log, an error body, or the OpenAPI document.

## Dependencies

**Every version in `package.json` is pinned exactly — no `^`, no `~`.** This is
a cryptographic service: a range accepts an upgrade nobody reviewed, and a
change in how a dependency encodes, parses or compares bytes breaks correctness
silently, without failing a build. Pinning makes every upgrade an explicit,
reviewable commit.

**YOU MUST keep it that way.** When adding a package, install it and then
replace the range with the resolved version (`pnpm add x && pnpm ls x`). To
upgrade, change the version deliberately, run `pnpm install && pnpm test`, and
commit the `package.json` and `pnpm-lock.yaml` changes together.

## Tests

Every change ships with tests. Three Jest projects, three globs — a file in the
wrong place is silently never run:

| Level       | Location                                        | Scope                                                    |
| ----------- | ----------------------------------------------- | -------------------------------------------------------- |
| Unit        | `src/**/*.test.ts`, next to the file under test | One unit, dependencies faked                             |
| Integration | `src/<domain>/test/*.integration.test.ts`       | Real Nest app via `createTestApp`, one domain, real HTTP |
| E2E         | `test/*.e2e.test.ts`                            | Full app, endpoints chained end to end                   |

- Unit and integration are required. Add an e2e test only when the behaviour
  spans several endpoints; it must chain real calls and never hardcode a value
  produced by a previous one.
- Write the test first and watch it fail for the right reason — the feature
  missing, not a typo or a bad import.
- **Never weaken a test or a lint rule to get to green.**
- Adapters are covered by `*.contract.test.ts`, run with `describe.each`
  against every implementation of the port.
- Property-based tests pin the fast-check seed so runs reproduce.

## Design decisions

Ports & adapters. A module binding is the only place an algorithm is named:

```ts
{ provide: CIPHER, useClass: Base64Cipher }
```

Swapping an algorithm must change that line and nothing else. If it forces you
to touch a service or a controller, the abstraction is wrong — fix the
abstraction, not the caller.

`canonicalize` builds its `{...}` and `[...]` strings by hand instead of calling
`JSON.stringify` on a re-sorted object. This is deliberate: engines enumerate
array-index-like keys (`"1"`, `"10"`) in numeric order, which silently undoes
the sort. Do not "simplify" it.

Cryptography comes from `node:crypto` only — do not add a crypto dependency.

## Git

Conventional Commits, in English. Work on a feature branch and open a PR.
**Never push `main`.**

## Comments

Comment only when the code is **complex**, **ambiguous**, or encodes a **product
or design decision** — and then explain _why_, not _what_. Delete anything that
restates the declaration below it: no "port for the encryption algorithm" above
a port, no "domain service" above a service. A one-line summary is fine when a
name is genuinely not self-explanatory. Do not cite internal documents or
section numbers; state the rule so it stands on its own. Comments are in
English.

```ts
// Plain assignment hits the Object.prototype setter for the key "__proto__"
// and silently drops the property, breaking decrypt(encrypt(x)) === x.
Object.defineProperty(target, key, { value, enumerable: true, ... });
```

## Reference

- @docs/subject.md — the original assignment
- @docs/cahier-des-charges.md — the full specification
