# ADR-0313: Readable startup diagnostics and capability hints

- Status: accepted
- Date: 2026-10-09
- Supersedes, once accepted: ADR-0191 where the complete privilege report is printed by default
  and configured through `pluginPrivileges.logger`
- Refines: ADR-0191 (privilege reporting), ADR-0046 and ADR-0195 (capability requirements),
  ADR-0300 and ADR-0305 (the logs they require); applies ADR-0288
- Approval: decided by the user on 2026-10-09 (`docs/handoff/revue-plugins/core.md`, decision 7;
  `hono.md`, decision 6; `http.md`, decision 8; `access.md`, decisions 3 and 9; `graphql.md`,
  decision 2); record accepted by the user on 2026-10-09

## Context

Constructing an application prints the whole privilege report object through `console.info`
(`packages/core/src/application/plugin-privilege-policy.ts`), the only configurable sink is
`pluginPrivileges.logger`, and Core warns once through `console.warn`
(`packages/core/src/runtime/plugin-operations/engine-integration.ts`). Plugins have no logging
channel, although accepted records already require logs (retries, masked errors). A missing
capability says `requires capability "…" version "…"`
(`packages/core/src/plugins/capability-inventory.ts`) without saying what to install.

## Decision

1. **Application logger.** `new App({ logger, logLevel })`: `logger` is an object with `debug`,
   `info`, `warn` and `error` methods taking `(message: string, details?: object)` (the console
   is compatible and is the default), or `false` to silence everything; `logLevel` is `'debug'`,
   `'info'` (default), `'warn'` or `'error'`. Core never reads the environment to choose them.
   Plugins receive the same logger in their setup and start contexts; Core prefixes each line
   with the plugin package name. Logs never contain option values, secrets, credentials or row
   values. `pluginPrivileges.logger` is removed.
2. **One summary line at `info`.** After a successful `start()`, Core logs one line: the number
   of schemas, the plugin package names in graph order, and the `critical` privileges with their
   plugins, ending with how to see details, for example:

   ```text
   UltimaBase started: 3 schemas, 7 plugins (…); critical privileges: authority:elevate (@ultimabase/password-auth-plugin). Use logLevel 'debug' for the privilege report.
   ```

   The complete ADR-0191 report moves to `debug`. A denied privilege still logs the complete
   report at `error` and fails, as today.

3. **Important warnings are `warn`**, visible at the default level, one line each naming the
   plugin and the fix: operations opened by Access `allowWithoutRule` (production included, with
   predicate names), a transport exposing no schema or operation, HTTP routes or REST without a
   server plugin, and Core's unverified-protection warning. Informational summaries (schemas
   without Access rule, `access.md` decision 9) are `info`.
4. **Capability hints.** `defineCapability` accepts an optional `hint`: one line of plain text,
   at most 200 characters, written by the capability's owner, for example
   `Install @ultimabase/http-plugin and add httpPlugin() to UltimaBase.use(...)`.
   `PLUGIN_CAPABILITY_MISSING` appends it to the message and to `internalDetails.hint`. Core's own
   tokens (database adapter, principal) use neutral hints that name no plugin.

## Consequences

- Consumers to migrate: privilege policy and diagnostics, capability tokens and inventory,
  application options; official plugins replace their own messages with the logger and add hints
  to the capabilities they own (HTTP, GraphQL, introspection, authentication); retries
  (ADR-0300) and masked errors (ADR-0305) log through it; testing provides a capturing logger.
- Tests: exact summary line; report only at `debug`; denial still logged at `error`; `false`
  silences; each listed warning at default level; no secret or option value in any line;
  hint present in the message, absent hint unchanged, invalid hint rejected; a unit test asserts
  that the hints of Core's own tokens name no package.
- Documentation impact: both (troubleshooting and plugin-authoring pages, Core README).

## Out of scope

Structured log formats, OpenTelemetry, request access logs (`http.md`, decision 11), and
adapter capability messages (ADR-0301).
