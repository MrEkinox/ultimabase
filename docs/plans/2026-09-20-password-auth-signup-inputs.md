# Schema-derived Password Auth signup inputs

User-approved scope: signup accepts User create fields beside username and
password; login accepts only username and password. ADR-0257 records the contract.

## Acceptance

- [x] Infer required/default/optional fields directly for AppUser.signUp.
- [x] Delegate User data through ordinary creation and retain atomic auth writes.
- [x] Keep passwords out of User data and login inputs strict.
- [x] Derive REST codecs and GraphQL signup fields from the owned User schema.
- [x] Update GraphQL callers, package contracts, and public documentation.
- [x] Complete source/type, compiled integration, lint, build, and docs checks.
- [x] Create a dedicated local commit without pushing.

Documentation impact: both.

The Password Auth, REST, and GraphQL package contracts, public authentication and
plugin-author guides, minimal example, and ADR describe the new inputs.

## Scope audit

No Core change or automatic User CRUD exposure is introduced. The two small
transport metadata additions are necessary to reuse existing schema field
codecs and GraphQL types instead of duplicating schema compilation in Password
Auth. Nominal User references preserve strict concrete signup signatures.
The login regression exposed an existing HTTP 500 for malformed credentials;
its decoder now uses the declared uniform 401 error, and malformed signup uses
the existing 400 rejection. This is necessary to reject the requested invalid
inputs through the public error contract.
The unrelated apps/website/next-env.d.ts modification remains excluded.

## Validation

- Repository-wide `yarn typecheck` passed.
- Full `yarn build` passed; the final Password Auth decoder adjustment was
  rebuilt with declaration and publication checks passing.
- Source and type suites: 54 files, 272 tests passed, no type errors.
- Compiled integrations: all 65 tests across 21 files passed, including
  PostgreSQL, source/built editor contracts, transport parity, the minimal
  example, and generated JavaScript/TypeScript applications. The minimal
  declaration check hit its existing 5-second timeout during concurrent
  validation and passed when rerun alone; its timeout was not changed.
- Scoped lint passed with three file-length warnings and no errors.
- Website documentation validation: 17 files, 66 tests passed.
- Dependency constraints, changed-file formatting, and whitespace checks passed.
- The full repository unit suite was not repeated; affected package suites and
  compiled integrations ran alongside repository-wide typing/build checks.

No changes were pushed.
