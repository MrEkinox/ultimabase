# 2903: Generate the base TypeScript and JavaScript projects

- Status: completed
- Milestone: 29
- Packages: `@ultimabase/create-app`, `@ultimabase/typegen`
- Depends on: 2902
- ADR: decision from issue 2901, ADR-0184

## Goal

Turn a validated selection into a minimal, runnable PostgreSQL UltimaBase
project in either language before adding optional plugin families.

## Acceptance criteria

- [x] Generate ESM source files, package scripts, package metadata, README,
      `.gitignore`, and environment example for both a `Task` starter and an
      empty application. Only the starter claims to demonstrate a data
      operation.
- [x] TypeScript output installs and configures `@ultimabase/typegen`, loads
      the same application graph for generation, includes `.ultimabase`
      declarations, and generates before typecheck and build. A clean project
      does not need a manual bootstrap command.
- [x] JavaScript output uses `.js` sources and start scripts, with no
      `@ultimabase/typegen`, `typescript`, TypeScript config, generated
      declarations, or Typegen command.
- [x] The existing-database path explains `DATABASE_URL` without exposing it
      in logs. The local path generates a working, disposable PostgreSQL
      Docker Compose configuration and corresponding ignored development
      environment file; neither path assumes a database already exists.
- [x] Dependency installation uses the selected package manager and can be
      skipped. Destination validation, atomic writing or rollback, and
      actionable failures protect existing user files.
- [x] Output uses package-root imports and current public APIs only; generated
      scripts and terminal next steps match the selected language and database
      path.

## Tests

- [x] Temporary generated projects install, run their documented scripts, and
      prove the Typegen/no-Typegen split from packed public packages.
- [x] Test existing paths, invalid database input, skipped installs, failed
      installs, missing Docker, and regenerated clean TypeScript output.
- [x] Review affected Quick Start and Typegen public docs in the same issue;
      retain the unpublished-command warning.

## Completion evidence

- The local executable writes a base PostgreSQL application from either
  language and starter choice. TypeScript includes Typegen in the application
  graph and regenerates declarations before typecheck/build; JavaScript has
  neither Typegen nor TypeScript dependencies.
- Files are prepared in an owned sibling directory. Installation runs there
  with the selected manager; Docker credentials are created only afterward
  and remain in an ignored owner-readable `.env`. An exclusive destination
  reservation prevents replacement of an existing path. Failed installation
  or cancellation leaves the requested destination untouched.
- Package Vitest, typecheck, ESLint, and tsdown archive checks pass; repository
  typecheck, lint, build, issue and constraint checks, plus website content,
  typecheck, lint, and build also pass. Temporary
  generated TypeScript and JavaScript projects installed local packed public
  packages. Both started successfully against disposable PostgreSQL 17
  Alpine; TypeScript typechecked and built, including after deleting its
  generated declarations. The test containers and volumes were removed.
- Docker is a runtime prerequisite for the optional Compose path, not for
  generation. The project README gives the exact Compose command, and
  generation itself never invokes Docker. Invalid database flags, occupied
  files and symlinks, skipped and failed installs, and secret permissions are
  covered by tests.
- Documentation impact: public website documentation. Quick Start now names
  the scoped but still unpublished command and the agreed prompt journey.
  The package index and ownership mapping include the new package. The
  Typegen guide was reviewed and already documents the exact public loader,
  writer, script order, and generated-declaration behavior used here.

## Out of scope

- Optional plugin templates, a hosted PostgreSQL service, or production
  migration workflow.
