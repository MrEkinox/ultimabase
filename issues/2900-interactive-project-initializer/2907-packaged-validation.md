# 2907: Verify packaged generated projects

- Status: completed
- Milestone: 29
- Packages: `@ultimabase/create-app`, official plugins
- Depends on: 2906
- ADR: decision from issue 2901

## Goal

Prove that the initializer creates valid projects from its packed executable,
independently of monorepo-only imports or unpublished registry access.

## Acceptance criteria

- [x] Invoke the packed executable outside the monorepo through public package
      exports and verify the npm initializer mapping without claiming a
      registry command is live before publication.
- [x] Exercise npm, yarn, and pnpm installation and next-step scripts where
      supported, including TypeScript Typegen-before-typecheck/build and a
      JavaScript project with no Typegen or TypeScript dependency.
- [x] Cover starter and empty projects, both PostgreSQL modes, every official
      plugin singly, representative combined graphs, both HTTP APIs,
      interactive and flag-only invocations, cancellation, existing-file
      safety, and installation failures.
- [x] Record actionable failures and generated-project limitations for the
      dedicated Quick Start documentation issue. No package is published,
      pushed, or deployed by this verification.

## Tests

- [x] Run focused packed-consumer and generated-project tests; run
      `yarn check:issues`, `yarn constraints`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn build`, formatting, and relevant built PostgreSQL E2E
      checks. Document any unavailable environment prerequisite.

## Out of scope

- The full public tutorial, npm publication, website deployment, the general
  CLI in issue 716, and the manual or watch Typegen commands in issue 808.

## Handoff

- Documentation impact: internal engineering documentation. This issue checks
  packaging and generated-project behavior; the public Quick Start still
  correctly marks all registry commands as unavailable. Issue 2908 owns the
  full public walkthrough.
- A local npm archive runs outside the repository through its packaged binary
  and public export map. `npx` with that archive and native yarn/pnpm `dlx`
  installation and execution were manually verified. Each invocation selected
  the expected package manager and printed matching next commands. The
  automated packed test covers manager detection, both languages, both
  database choices, all 16 official plugins singly, Typegen plus TypeScript
  build for each, API selections, occupied destinations, and installation
  rollback. Existing selection tests cover interactive/flag equivalence and
  cancellation; generated-project PostgreSQL tests cover combined graphs and
  HTTP request boundaries.
- Registry-based installation of a newly generated application cannot be
  exercised yet: its `@ultimabase/*` dependencies have not been published.
  Built-project checks use the repository's compiled public packages without
  source deep imports. A post-publication smoke test must run the advertised
  registry commands and dependency installation before removing the Quick
  Start warning.
- Validation: packed E2E (6 tests), generated-project PostgreSQL E2E (9 tests),
  `yarn constraints`, `yarn check:issues`, `yarn typecheck`, root unit/type/
  performance suite (509 files, 2,400 tests), lint (baseline warnings only),
  build, and Prettier passed. The repository browser-facing tests require
  local-listener access outside the restricted sandbox.
- No implementation exceeded the acceptance criteria. No package was
  published, and nothing was pushed or deployed.
