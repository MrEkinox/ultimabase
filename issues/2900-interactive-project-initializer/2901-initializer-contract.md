# 2901: Decide the initializer contract

- Status: ready
- Milestone: 29
- Packages: architecture documentation, future `@ultimabase/create-app`
- Depends on: none
- ADR: new ADR required

## Goal

Fix the standalone project initializer's public command, prompt and flag
contract, project outputs, and security boundaries before writing templates.

## Acceptance criteria

- [ ] An accepted ADR verifies the scoped npm `create` mapping and records the
      package name, executable, Node.js floor, and relationship to issues 716
      and 808 without making either deferred issue a dependency.
- [ ] The question flow covers project name, TS/JS, REST/GraphQL multi-select,
      all current official plugins, runnable example or empty application,
      existing PostgreSQL or local Compose, installation, and package-manager
      detection. Flags and `--yes` have unambiguous non-TTY behavior.
- [ ] The contract defines one normalized selection model, plugin dependencies,
      mutually exclusive choices, truthful capability notes, and how the API
      answer stays synchronized with the complete official-plugin selector.
- [ ] TypeScript always includes Typegen generation before typecheck/build;
      JavaScript never installs Typegen or TypeScript tooling. Generated files
      remain declarations, not Runtime state or a client.
- [ ] Existing-path safety, cancellation, installation failure, secret files,
      local-only HTTP defaults, and safe handling of authentication versus
      authorization are explicit.
- [ ] The decision names the exact generated scripts and next-step commands
      for npm, Yarn, and pnpm, and defines what remains a preview until npm
      publication.

## Tests

- [ ] Backlog metadata, ADR link validation, formatting, and `git diff --check`
      pass.

## Out of scope

- The package implementation, a general framework CLI, Typegen watch mode,
  migrations, and npm publication.
