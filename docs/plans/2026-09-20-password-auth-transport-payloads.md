# Password Auth transport payloads

User-requested scope: remove redundant principals from REST and GraphQL
authentication payloads, as recorded in ADR-0255.

## Acceptance

- [x] Return only `user` and `session` for sign-up, login, and refresh bindings.
- [x] Remove GraphQL's principal field and `PasswordAuthPrincipal` type.
- [x] Retain server results and internal request identity.
- [x] Add regression coverage and migrate transport examples and consumers.
- [x] Update affected public and engineering documentation.
- [x] Complete focused validation and a dedicated local commit.

Documentation impact: both.

Password Auth and GraphQL READMEs, the minimal example, and the public Password
Auth page now use the profile identity. ADR-0255 records the wire contract change.

## Scope audit

No implementation exceeds the requested REST/GraphQL cleanup. The shared encoder
serves both existing bindings. Direct server results and the separate cookie
endpoints retain their contracts. No Core code changes are needed. The unrelated
pre-existing change to `apps/website/next-env.d.ts` remains outside this work.

## Validation

- `yarn typecheck` passed across the repository.
- `yarn build` passed, including declaration and package publication checks.
- Focused Password Auth source/type suite: 14 files, 59 tests passed with no type errors.
- Compiled Password Auth and cross-transport integration suites: 10 files,
  30 tests passed, including PostgreSQL session lifecycle, profile policies,
  removed GraphQL selections, and authenticated REST/GraphQL parity.
- Targeted lint passed for Password Auth and both changed cross-transport tests.
- Website documentation validation: 17 files, 66 tests passed.
- Dependency constraints, formatting, and diff whitespace checks passed.

The full repository unit suite was not repeated for this transport projection
change; the complete plugin suite and affected cross-transport integrations ran.
