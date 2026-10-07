# 2806: Author the English getting-started journey

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2805
- ADR: none

## Goal

Give a new developer one short, truthful path from understanding the product to
running a first application through the intended npm installation experience.

## Acceptance criteria

- [x] Introduction explains the product, pre-release status, target audience,
      and explicit non-goals in user language.
- [x] Installation documents Node.js requirements, package-manager commands,
      PostgreSQL prerequisites, and intended `@ultimabase/*` npm packages.
- [x] First Application builds one minimal typed schema, installs only required
      plugins, starts the application, and performs one operation.
- [x] Project Structure explains application code, generated declarations, and
      the separation between Runtime truth and optional Typegen output.
- [x] Every sample uses current public package exports without repository
      internals.
- [x] Next-step links lead to schemas, queries, plugins, security, REST, and
      GraphQL.

## Tests

- [x] Code examples compile or execute against current workspace package exports
      through a focused documentation fixture.
- [x] Documentation link and frontmatter validation pass.

## Completion evidence

- Five English pages now move from product fit and prerequisites through
  installation, a running `Task` application, project structure, and deliberate
  next paths. The sidebar and page pagination publish only this completed
  section.
- Installation shows npm, Yarn, and pnpm commands, Node.js 24, a dedicated
  PostgreSQL development database, strict ESM TypeScript, environment handling,
  and the intended registry package names with explicit pre-release language.
- The first application installs only Core and PostgreSQL, defines one static
  schema, starts the application, performs one typed `createOne`, prints the
  result, and disposes its owned resources. Production schema synchronization
  is explicitly excluded from the exercise.
- `schema.ts`, `ultimabase.ts`, and `main.ts` are mirrored by focused TypeScript
  fixtures. Website typecheck compiles them through public workspace exports,
  while content validation rejects any drift between the displayed blocks and
  those fixtures.
- Project structure distinguishes application declarations and lifecycle from
  optional Typegen output. Next-step cards route to current canonical schema,
  Query, security, plugin, REST, and GraphQL contracts until their curated site
  sections are published.
- Publishing the first child pages exposed a server/client active-path mismatch
  caused by the canonical `/docs` to internal `/en/docs` rewrite. The Fumadocs
  framework provider now normalizes that path consistently while retaining
  Next.js links; browser coverage verifies navigation, search, and hydration.
- `yarn website:validate` passes eight content tests and `yarn website:test`
  passes seven production browser tests, including the compiled sample blocks,
  the First Application page, accessibility, and explicit French fallback.
- Website typecheck, lint, production build, repository constraints, issue
  metadata, formatting, root TypeScript, and workspace lint pass. Workspace
  lint reports only seven existing file-line-budget warnings outside the site.

## Out of scope

- Every official plugin, production deployment, unshipped migrations, or
  repository-contributor setup.
