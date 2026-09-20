# Password Auth REST paths

User-approved scope: expose the four Password Auth operations at
`/api/v1/auth/sign-up`, `/api/v1/auth/login`, `/api/v1/auth/refresh`, and
`/api/v1/auth/logout`. ADR-0256 records the minimal binding metadata change.

## Acceptance

- [x] Add optional static public paths to REST operation bindings.
- [x] Retain the existing namespaced default for operations without a path.
- [x] Declare Password Auth's four short paths and remove old route aliases.
- [x] Preserve explicit exposure, request bodies, responses, and Runtime semantics.
- [x] Reuse the Core planner without modifying Core or Soft Delete.
- [x] Update clients, documentation, and regression coverage.
- [x] Complete focused and broader checks and a dedicated local commit.

Documentation impact: both.

REST and Password Auth READMEs, the public REST and Password Auth guides, and
the plugin-author operation guide describe the new paths and migration.

## Scope audit

No implementation exceeds the approved scope. Static path validation reserves
generated schema and default operation namespaces so the new field cannot
shadow existing dynamic routes. Cookie endpoints, GraphQL, and direct calls
keep their contracts. The unrelated `apps/website/next-env.d.ts` change remains
outside this work.

## Validation

- `yarn typecheck` passed across the repository.
- `yarn build` passed, including declaration and package publication checks.
- REST and Password Auth source/type suites: 32 files, 163 tests passed with
  no type errors. The initial run exposed an imprecise internal operation
  target type; the normalizer now retains its validated application target.
- Compiled integration suites: 15 files, 50 tests passed across REST,
  Password Auth, cross-transport authentication, and generated JavaScript and
  TypeScript applications. All four removed URLs return 404.
- Targeted lint passed with the existing REST `plugin.ts` file-size warning.
- Website documentation validation: 17 files, 66 tests passed.
- Dependency constraints, changed-file formatting, and diff whitespace checks passed.

The complete repository unit suite was not repeated; the two affected package
suites and their compiled integrations ran, alongside repository-wide typing
and build checks. No changes were pushed.
