# 2908: Document the complete Quick Start journey

- Status: planned
- Milestone: 29
- Packages: `apps/website`, `@ultimabase/create-app`
- Depends on: 2907
- ADR: decision from issue 2901

## Goal

Turn the implemented initializer and verified generated projects into a
complete developer-facing Quick Start, from first command to a running
application and its next customization steps.

## Acceptance criteria

- [ ] Quick Start shows the real interactive question sequence, the grouped
      official-plugin choices, how REST and GraphQL multi-selection adds
      prerequisites, and a concrete final summary. It explains flag-only
      automation without duplicating every prompt.
- [ ] Separate TypeScript and JavaScript paths show the actual generated file
      tree, dependencies, scripts, and commands. TypeScript explicitly explains
      automatic Typegen generation before typecheck/build; JavaScript has no
      Typegen or TypeScript setup.
- [ ] Document both local Docker Compose and existing PostgreSQL paths, the
      runnable `Task` and empty starter choices, installation or skip-install,
      environment setup, first successful command, and what to edit next.
- [ ] Explain plugin selection and automatic dependencies without presenting
      Password Auth as authorization or PostgreSQL Vector as persisted vector
      storage. Link to canonical plugin and security guides for details.
- [ ] Update package index, Typegen guidance, release status, documentation
      ownership metadata, and the initializer package README where needed;
      eliminate stale claims that prompts or output files are undefined.
- [ ] Keep the website's unpublished-command warning and working manual path
      until npm publication is separately approved and verified. No public
      instruction tells readers that an unpublished registry command works.

## Tests

- [ ] Validate every shown command and file tree against issue 2907's packed
      outputs and current package exports. Run website content, link, typecheck,
      lint, browser, and production-build checks plus formatting and issue
      metadata checks.

## Out of scope

- Publishing packages or the website, changing Fumadocs' standard documentation
  components, or implementing new generator options.
