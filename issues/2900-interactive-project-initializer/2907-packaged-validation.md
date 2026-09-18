# 2907: Verify packaged generated projects

- Status: planned
- Milestone: 29
- Packages: `@ultimabase/create-app`, official plugins
- Depends on: 2906
- ADR: decision from issue 2901

## Goal

Prove that the initializer creates valid projects from its packed executable,
independently of monorepo-only imports or unpublished registry access.

## Acceptance criteria

- [ ] Invoke the packed executable outside the monorepo through public package
      exports and verify the npm initializer mapping without claiming a
      registry command is live before publication.
- [ ] Exercise npm, Yarn, and pnpm installation and next-step scripts where
      supported, including TypeScript Typegen-before-typecheck/build and a
      JavaScript project with no Typegen or TypeScript dependency.
- [ ] Cover starter and empty projects, both PostgreSQL modes, every official
      plugin singly, representative combined graphs, both HTTP APIs,
      interactive and flag-only invocations, cancellation, existing-file
      safety, and installation failures.
- [ ] Record actionable failures and generated-project limitations for the
      dedicated Quick Start documentation issue. No package is published,
      pushed, or deployed by this verification.

## Tests

- [ ] Run focused packed-consumer and generated-project tests; run
      `yarn check:issues`, `yarn constraints`, `yarn typecheck`, `yarn test`,
      `yarn lint`, `yarn build`, formatting, and relevant built PostgreSQL E2E
      checks. Document any unavailable environment prerequisite.

## Out of scope

- The full public tutorial, npm publication, website deployment, the general
  CLI in issue 716, and the manual or watch Typegen commands in issue 808.
