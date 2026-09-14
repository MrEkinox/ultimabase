# 2806: Author the English getting-started journey

- Status: planned
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2805
- ADR: none

## Goal

Give a new developer one short, truthful path from understanding the product to
running a first application through the intended npm installation experience.

## Acceptance criteria

- [ ] Introduction explains the product, pre-release status, target audience,
      and explicit non-goals in user language.
- [ ] Installation documents Node.js requirements, package-manager commands,
      PostgreSQL prerequisites, and intended `@ultimabase/*` npm packages.
- [ ] First Application builds one minimal typed schema, installs only required
      plugins, starts the application, and performs one operation.
- [ ] Project Structure explains application code, generated declarations, and
      the separation between Runtime truth and optional Typegen output.
- [ ] Every sample uses current public package exports without repository
      internals.
- [ ] Next-step links lead to schemas, queries, plugins, security, REST, and
      GraphQL.

## Tests

- [ ] Code examples compile or execute against current workspace package exports
      through a focused documentation fixture.
- [ ] Documentation link and frontmatter validation pass.

## Out of scope

- Every official plugin, production deployment, unshipped migrations, or
  repository-contributor setup.
