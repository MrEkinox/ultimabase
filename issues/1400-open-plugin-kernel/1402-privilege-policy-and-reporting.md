# 1402: Enforce application privilege policy and startup reporting

- Status: completed
- Milestone: 14
- Packages: `@ultimabase/core`
- Depends on: 1403
- ADR: ADR-0186, ADR-0191

## Goal

Let developers deny plugin privileges from `UltimaBase` configuration and
receive one structured graph report before any plugin contribution or effect.

## Acceptance criteria

- [x] `UltimaBase` and `FrameworkApplication` accept one typed `pluginPrivileges` policy with cumulative global, plugin-ID, and exact-instance `deny` and `denyClaims` lists.
- [x] The default allows requested privileges while denied required or active conditional privileges produce one aggregated `PLUGIN_PRIVILEGE_DENIED` error.
- [x] Unknown privilege, claim, plugin, or instance policy targets fail as configuration typos instead of being ignored.
- [x] Inactive conditional privileges are reported but do not fail policy validation.
- [x] Policy validation completes before static declarations, Typegen, setup, connect, Runtime, or transport work.
- [x] Core derives owner-bound grants before setup; every privilege-scoped facade introduced from this issue onward requires one active grant. Legacy setup registries preserve compatibility until 1415 and are not reclassified as privileged facades in this issue.
- [x] The default console logger reports graph order, structured instance identity, version, privilege reason and severity, active state, environmental claims, and policy result; `pluginPrivileges.logger` may replace it or explicitly silence it with `false`.
- [x] Reports and failures contain no plugin options, secrets, raw credentials, capability values, or unverifiable sandbox claim.
- [x] Read-only `application.pluginPrivilegeReport` inspection exposes the same detached report after successful initialization.

## Tests

- [x] Runtime tests cover every policy scope, claims, unknown targets, nested instances, aggregated failures, conditional Typegen privileges, default and custom loggers, explicit silence, logger failure isolation, and lifecycle non-execution.
- [x] Type and language-service tests cover policy autocomplete, exact plugin names when inferable, diagnostics, and packed exports.

## Out of scope

- A privilege approval lockfile, interactive prompt, or OS sandbox.
- Verifying that trusted module code honestly declared every direct Node.js environment access.
- Capability resolution; issues 1403 and 1404 own that work.
