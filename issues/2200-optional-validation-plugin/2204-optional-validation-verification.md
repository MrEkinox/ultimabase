# 2204: Verify optional field validation

- Status: completed
- Milestone: 22
- Packages: repository-wide verification
- Depends on: 2203
- ADR: ADR-0223

## Goal

Prove that optional Standard Schema field validation works as one complete
public vertical while Core remains independently usable and structurally safe.

## Acceptance criteria

- [x] A Typegen-enabled TypeScript application installs `validationPlugin()` and
      receives exact `validation` autocomplete and hover documentation for
      built-in and plugin-defined stored fields.
- [x] A Typegen-free JavaScript application can install the plugin and execute
      valid and invalid mutations through public package exports.
- [x] An application without the plugin supports structural CRUD, rejects an
      untyped `validation` option during compilation, and allocates no optional
      validation behavior.
- [x] Two applications in one process may install different validators or omit
      the plugin without sharing plans, callbacks, or option ownership.
- [x] Zod and Valibot fixtures prove direct Standard Schema interoperability
      without becoming production dependencies of Core or the plugin.
- [x] Create, update, upsert, defaults, generators, transformed inputs, lists,
      embedded objects, pointers, and plugin-defined fields preserve exact
      invocation and issue-path semantics.
- [x] Reads, adapter results, materializations, includes, result replacements,
      mutation outcomes, and final projections execute zero application
      validators while retaining Core structural rejection.
- [x] Integer, bigint, float, and decimal arithmetic validate projected complete
      values once, retain atomic adapter deltas, and preserve targetless and bulk
      failure behavior.
- [x] Anonymous and Master mutations both execute installed validation; Master
      continues to bypass only authorization policies.
- [x] A responsibility-based removal audit finds no Core-owned field-validation
      option, Standard Schema application executor, compatibility export,
      implicit installation, or parallel legacy route.
- [x] Package manifests, archive allowlists, constraints, README files,
      architecture docs, roadmap, ADR backlinks, issue status, and the completed
      plan record agree with the delivered contract.

## Tests

- [x] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` serially where generated
      output can be cleaned.
- [x] Run `yarn test:pack` against built archives.
- [x] Run the relevant public and PostgreSQL Testcontainers E2E suites, including
      installed and absent plugin applications.
- [x] Record exact commands, counts, coverage, and any environment limitation in
      the milestone completion evidence.

## Out of scope

- New field kinds or validation shortcuts.
- Performance work beyond detecting a material regression in the changed path.
- Resuming paused ACL or generated-schema objectives.

## Completion evidence

- `yarn constraints`
- `yarn check:issues` — 1 file and 9 tests passed
- `yarn typecheck`
- `yarn test` — 350 files and 1,703 tests passed
- `yarn lint` — zero errors; reviewed historical line-budget warnings only
- `yarn format:check`
- `yarn build` — every workspace passed declarations, ATTW, and publint
- `yarn test:pack` — 19 files and 98 tests passed against package archives
- `yarn test:coverage` — 400 files and 1,856 tests passed, including the complete
  public and PostgreSQL Testcontainers projects, with no type errors

Repository coverage finished at 88.87% statements, 81.71% branches, 94.36%
functions, and 89.03% lines. The validation plugin finished at 87.36%
statements, 77.43% branches, 95.12% functions, and 87.91% lines.

The first container run inside filesystem isolation could not discover Docker.
The required retry outside isolation passed with no remaining environment
limitation. The responsibility audit found no Core-owned Standard Schema field
option, application validator executor, implicit installation, or legacy
compatibility route.
