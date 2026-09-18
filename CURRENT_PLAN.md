# Active plan: interactive project initializer

- Status: in-progress
- Milestone: 29
- Created: 2026-09-18
- Current issue: none
- Next issue: 2906
- Governing backlog: [Milestone 29](issues/2900-interactive-project-initializer/README.md)
- Previous completed plan: [Public website and documentation foundation](docs/plans/completed/public-website-and-documentation-foundation.md)

## Objective

Create a publishable `@ultimabase/create-app` package that asks a developer a
small sequence of terminal questions and writes a valid, runnable UltimaBase
application. This plan records the agreed journey and orders implementation
issues; it does not itself implement or publish the initializer.

The Quick Start currently previews an unpublished command. Keep that warning
until registry publication is separately authorized and verified. The
initializer is independent of the general `ultimabase` CLI (issue 716) and
manual Typegen/watch commands (issue 808), both still in their existing backlog.

## Developer journey

The proposed command is `npm create @ultimabase/app@latest`, whose package is
`@ultimabase/create-app`. Issue 2901 verifies and records that mapping in an
ADR before any public documentation treats it as usable. The interactive path
asks, in order:

1. Project name and destination.
2. TypeScript or JavaScript.
3. Which HTTP APIs to expose: REST and GraphQL as a multi-select; choosing
   neither keeps direct application calls.
4. Which official plugins to add, grouped by purpose. All 16 current official
   plugin packages are represented. The prior API selection appears in the
   same state, while required infrastructure is added visibly.
5. Runnable `Task` example or empty application.
6. Existing PostgreSQL or a generated local Docker Compose setup.
7. Install dependencies now or print the command for later.

Detect the package manager when unambiguous; otherwise ask. A final summary
lists the chosen plugins, automatic dependencies, generated files, and next
commands before writing. Flag-only operation uses the same normalized model.
The CLI may use an established prompt library for text, select, multi-select,
confirmation, cancellation, and progress; it need not invent terminal controls.

## Generated-project invariants

- PostgreSQL is the explicit base adapter. The starter example is runnable;
  an empty application does not claim to demonstrate a data operation.
- TypeScript automatically installs `@ultimabase/typegen`, configures
  `typegenPlugin()` and generated declarations, and regenerates before
  typecheck/build. No separate Typegen question or first-build bootstrap step
  is required.
- JavaScript writes `.js` files and installs no Typegen, TypeScript,
  `tsconfig.json`, or declaration generation. It uses the same compiled
  application and Runtime semantics.
- The official selector is exhaustive for shipped plugin packages, including
  advanced HTTP and explorer plugins. It does not include planned packages.
  `@ultimabase/graphql-http` is a support contract, not a plugin;
  `@ultimabase/typegen` is selected by language rather than in the catalog.
- A plugin choice must produce a valid graph and honest sample. The logical
  vector plugin does not imply persisted PostgreSQL vectors. Password Auth
  identifies a caller but grants no schema access. HTTP examples bind to
  loopback and do not call unverified protection secure.
- Missing non-interactive inputs, incompatible selections, cancellation, and
  an occupied destination fail before overwriting user files. Secrets stay in
  ignored local files and never appear in terminal output.
- No generated client, migrations, hosted service, general CLI command,
  Typegen watch mode, or Core feature is added by this plan.

## Execution sequence

1. **2901 — Contract and ADR.** Fix package and command identity, flags,
   question model, plugin resolution, generated scripts, failure behavior, and
   safe defaults before implementation.
2. **2902 — Interactive selection.** Create the scoped package's executable,
   prompts, equivalent flags, validation, catalog coverage, and cancellation
   behavior without writing projects yet.
3. **2903 — Base projects.** Generate TypeScript and JavaScript ESM projects,
   automatic or absent Typegen, `Task` or empty starter, PostgreSQL choices,
   installation, and exact next steps.
4. **2904 — Data and behavior.** Add PostgreSQL Vector, Soft Delete,
   Validation, and Hooks templates with tested, honest examples.
5. **2905 — Security.** Add Password Auth, Access, Roles, and Object ACLs with
   explicit identity versus authorization behavior and private secrets.
6. **2906 — APIs.** Add HTTP, Hono, REST, GraphQL, Yoga, GraphiQL, and Apollo
   Sandbox composition; synchronize with the API question and keep browser
   tooling development-only by default.
7. **2907 — Packaged-project verification.** Test the packed executable and
   generated projects across the complete selection matrix and supported
   package managers.
8. **2908 — Quick Start documentation.** Document the complete interactive
   journey, TypeScript and JavaScript outputs, database paths, plugin choices,
   generated files, and next commands without claiming an unpublished npm
   package is available.

Each issue includes its own focused tests and public-documentation impact
review. Issue 2907 closes only after its broader packaged-project checks;
issue 2908 owns the full reader walkthrough. Do not combine the deferred
general CLI or Typegen command issues into this milestone.

## Verification and handoff

For each issue, read `AGENTS.md`, the milestone README, that issue, relevant
package READMEs, and applicable ADRs. Check local and remote Git state, preserve
unrelated changes, run the narrowest useful tests, and record exactly one
Documentation impact classification. Update affected public documentation
with behavior changes in the same issue while retaining the unpublished
warning. Make a dedicated commit after a completed issue; do not push or
publish without explicit user authorization.

The final gate checks packed-package execution, TypeScript and JavaScript
outputs, the automatic Typegen split, official plugin coverage, PostgreSQL
startup, HTTP request safety, terminal and flag modes, package-manager
commands, documentation examples, and the relevant repository checks.

## Stop boundaries

Stop for an ADR or user direction if a plugin selection would require a new
Core capability, transport route, storage compiler, authentication provider,
or security exception. Do not silently relax an unsupported selection to an
unprotected or non-runnable project. No npm publication, Git push, or website
deployment is authorized by this planning request.

Resume point: **issue 2906 — HTTP, API, and explorer plugin templates**.
