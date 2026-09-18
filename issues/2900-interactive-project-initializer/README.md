# Milestone 29 — Interactive project initializer

- Status: in-progress

Create a standalone, scoped project initializer that turns a short interactive
conversation into a runnable UltimaBase application. It is a project generator,
not the deferred general `ultimabase` CLI from issue 716 or the Typegen command
and watch mode from issue 808. The existing Core and plugin contracts remain the
authority for every generated application.

## Execution order

1. [x] [2901 — Decide the initializer contract](2901-initializer-contract.md)
2. [ ] [2902 — Build the interactive selection boundary](2902-interactive-selection.md)
3. [ ] [2903 — Generate the base TypeScript and JavaScript projects](2903-base-project-templates.md)
4. [ ] [2904 — Compose data and behavior plugins](2904-data-behavior-plugin-templates.md)
5. [ ] [2905 — Compose security plugins safely](2905-security-plugin-templates.md)
6. [ ] [2906 — Compose HTTP, API, and explorer plugins](2906-api-plugin-templates.md)
7. [ ] [2907 — Verify packaged generated projects](2907-packaged-validation.md)
8. [ ] [2908 — Document the complete Quick Start journey](2908-quick-start-documentation.md)

The issues are sequential so each plugin family extends one validated project
model. Do not publish the initializer while an official plugin can be selected
without a valid generated configuration or an explicit, truthful limitation.

## Agreed developer journey

- The proposed entry point is `npm create @ultimabase/app@latest`, backed by a
  future `packages/create-app` workspace named `@ultimabase/create-app`.
  Issue 2901 verifies the npm mapping and records the public command before
  implementation or documentation presents it as available.
- Ask for a project name, TypeScript or JavaScript, a multi-select of REST and
  GraphQL HTTP APIs, official plugins, a runnable `Task` example or an empty
  application, existing PostgreSQL or generated local Docker Compose setup,
  and whether to install dependencies. Detect the package manager when
  unambiguous; ask only when needed.
- Show all 16 current official plugin packages in a grouped selector. The API
  answer and plugin selector share one selection state; required infrastructure
  is visibly included without duplicate questions. Keep the catalog exhaustive
  as official plugin packages change. PostgreSQL is included by the base
  database template.
- TypeScript automatically installs and configures `@ultimabase/typegen`,
  includes generated declarations, and regenerates before typechecking and
  building. JavaScript generates `.js` sources and installs no Typegen or
  TypeScript tooling. Typegen is not an optional selector choice.
- Every prompt has a flag equivalent for automation. Cancellation and invalid
  choices leave existing files alone; no non-interactive path silently chooses
  a destructive destination.

## Product and security boundaries

- The plugin selector covers current official packages only, not planned file,
  cache, migration, authentication-provider, or other future packages.
- `@ultimabase/pg-vector-plugin` may be selected as a logical field contract,
  but the generated PostgreSQL example must not persist vector fields until
  physical storage exists.
- Password Auth supplies identity, not authorization. Generated HTTP examples
  never imply that sessions alone protect CRUD routes. Access, ACL, and Master
  remain explicit and application-scoped.
- A runnable local example may use development-only configuration, but it must
  bind to loopback by default and explain what must change before network
  exposure. Secrets are never printed or committed.
- The initializer does not add Core APIs, a generated Runtime client, a hosted
  service, a migration engine, a general dev server, or Typegen watch mode.
- Until packages are actually published, the website must continue to mark the
  `create` command as unavailable. This milestone prepares a verified package
  and accurate documentation; it does not authorize npm publication or deploy.

## Completion gate

Pack and invoke the initializer through its public executable. Verify
TypeScript and JavaScript outputs on clean directories, the Typegen/no-Typegen
split, both PostgreSQL paths, each official plugin and representative combined
selections, REST and GraphQL, interactive and flag-only modes, package-manager
commands, cancellation, existing-file safety, and all generated sample
typechecks/builds/starts that their declared prerequisites allow. Finish the
relevant repository gates and author a complete, verified Quick Start
walkthrough in the website documentation while retaining the unpublished
warning.
