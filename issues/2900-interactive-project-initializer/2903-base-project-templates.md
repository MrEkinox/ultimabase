# 2903: Generate the base TypeScript and JavaScript projects

- Status: planned
- Milestone: 29
- Packages: `@ultimabase/create-app`, `@ultimabase/typegen`
- Depends on: 2902
- ADR: decision from issue 2901, ADR-0184

## Goal

Turn a validated selection into a minimal, runnable PostgreSQL UltimaBase
project in either language before adding optional plugin families.

## Acceptance criteria

- [ ] Generate ESM source files, package scripts, package metadata, README,
      `.gitignore`, and environment example for both a `Task` starter and an
      empty application. Only the starter claims to demonstrate a data
      operation.
- [ ] TypeScript output installs and configures `@ultimabase/typegen`, loads
      the same application graph for generation, includes `.ultimabase`
      declarations, and generates before typecheck and build. A clean project
      does not need a manual bootstrap command.
- [ ] JavaScript output uses `.js` sources and start scripts, with no
      `@ultimabase/typegen`, `typescript`, TypeScript config, generated
      declarations, or Typegen command.
- [ ] The existing-database path explains `DATABASE_URL` without exposing it
      in logs. The local path generates a working, disposable PostgreSQL
      Docker Compose configuration and corresponding ignored development
      environment file; neither path assumes a database already exists.
- [ ] Dependency installation uses the selected package manager and can be
      skipped. Destination validation, atomic writing or rollback, and
      actionable failures protect existing user files.
- [ ] Output uses package-root imports and current public APIs only; generated
      scripts and terminal next steps match the selected language and database
      path.

## Tests

- [ ] Temporary generated projects install, run their documented scripts, and
      prove the Typegen/no-Typegen split from packed public packages.
- [ ] Test existing paths, invalid database input, skipped installs, failed
      installs, missing Docker, and regenerated clean TypeScript output.
- [ ] Review affected Quick Start and Typegen public docs in the same issue;
      retain the unpublished-command warning.

## Out of scope

- Optional plugin templates, a hosted PostgreSQL service, or production
  migration workflow.
