# 2204: Verify optional field validation

- Status: planned
- Milestone: 22
- Packages: repository-wide verification
- Depends on: 2203
- ADR: ADR-0223

## Goal

Prove that optional Standard Schema field validation works as one complete
public vertical while Core remains independently usable and structurally safe.

## Acceptance criteria

- [ ] A Typegen-enabled TypeScript application installs `validationPlugin()` and
      receives exact `validation` autocomplete and hover documentation for
      built-in and plugin-defined stored fields.
- [ ] A Typegen-free JavaScript application can install the plugin and execute
      valid and invalid mutations through public package exports.
- [ ] An application without the plugin supports structural CRUD, rejects an
      untyped `validation` option during compilation, and allocates no optional
      validation behavior.
- [ ] Two applications in one process may install different validators or omit
      the plugin without sharing plans, callbacks, or option ownership.
- [ ] Zod and Valibot fixtures prove direct Standard Schema interoperability
      without becoming production dependencies of Core or the plugin.
- [ ] Create, update, upsert, defaults, generators, transformed inputs, lists,
      embedded objects, pointers, and plugin-defined fields preserve exact
      invocation and issue-path semantics.
- [ ] Reads, adapter results, materializations, includes, result replacements,
      mutation outcomes, and final projections execute zero application
      validators while retaining Core structural rejection.
- [ ] Integer, bigint, float, and decimal arithmetic validate projected complete
      values once, retain atomic adapter deltas, and preserve targetless and bulk
      failure behavior.
- [ ] Anonymous and Master mutations both execute installed validation; Master
      continues to bypass only authorization policies.
- [ ] A responsibility-based removal audit finds no Core-owned field-validation
      option, Standard Schema application executor, compatibility export,
      implicit installation, or parallel legacy route.
- [ ] Package manifests, archive allowlists, constraints, README files,
      architecture docs, roadmap, ADR backlinks, issue status, and the completed
      plan record agree with the delivered contract.

## Tests

- [ ] Run `yarn constraints`, `yarn check:issues`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn format:check`, and `yarn build` serially where generated
      output can be cleaned.
- [ ] Run `yarn test:pack` against built archives.
- [ ] Run the relevant public and PostgreSQL Testcontainers E2E suites, including
      installed and absent plugin applications.
- [ ] Record exact commands, counts, coverage, and any environment limitation in
      the milestone completion evidence.

## Out of scope

- New field kinds or validation shortcuts.
- Performance work beyond detecting a material regression in the changed path.
- Resuming paused ACL or generated-schema objectives.
