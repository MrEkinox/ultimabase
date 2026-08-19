# ADR-0191: Plugin privilege taxonomy, reporting, and diagnostics

- Status: accepted
- Date: 2026-08-11
- Refines: ADR-0031, ADR-0042, ADR-0186, ADR-0190
- Depends on: ADR-0186, ADR-0190
- Refined by: ADR-0199

## Context

ADR-0186 requires declared privileges and startup denial, but examples are not a
stable vocabulary. Filesystem and network access are also different from
UltimaBase-owned facades because trusted in-process Node.js code can access the
environment directly.

The startup report must be useful without requiring developers to install a
logger, and community operations need safe machine-readable errors without
weakening Core's framework error boundary.

## Decision

### Initial enforceable privilege vocabulary

Core exposes one closed initial `PluginPrivilege` union:

- static application powers: `schema:declare`, `schema:transform`,
  `schema:replace`, `model:extend`, `query:extend`, and `operation:declare`;
- capability powers: `capability:decorate` and `capability:replace`;
- execution powers: `runtime:observe`, `runtime:intercept`,
  `runtime:constrain`, `runtime:replace`, and `persistence:rewrite`;
- integration powers: `adapter:consume`, `adapter:raw`,
  `migration:contribute`, `transport:expose`, and `event:publish`;
- Typegen powers: `typegen:reference`, `typegen:contribute`, `typegen:emit`,
  and `typegen:replace`;
- host-facade powers: `filesystem:read`, `filesystem:write`,
  `network:access`, and `authority:elevate`.

Providing an ordinary namespaced capability, requiring one, running the
plugin's own lifecycle, and reading its own options require no privilege.
Decoration, replacement, cross-owner modification, public-surface extension,
observation or interception, migration intent, external exposure, raw
infrastructure access, and authority elevation always require the exact listed
power. `runtime:observe` cannot alter execution, while `runtime:intercept` may
transform only the replaceable logical boundary exposed to it. A privilege
never implies another privilege.

Every requested privilege carries a concise human-readable reason. Core assigns
`standard`, `sensitive`, or `critical` severity for reporting. The default
policy still allows requested privileges as accepted in ADR-0186; severity does
not secretly introduce an allow list. `schema:replace`, `runtime:replace`,
`adapter:raw`, `typegen:replace`, and `authority:elevate` are critical.

`authority:elevate` exposes only the audited Core elevation facade. It never
exposes a raw master key, never accepts transport-derived credentials, and does
not move Master ownership out of Core.

### Environmental claims are not privileges

Plugins may separately declare the informational claims
`environment:filesystem`, `environment:network`, `environment:process`, and
`environment:native-code`. Application policy may deny a claimed environment
power and fail startup, but Core explicitly cannot verify that trusted module
code declared every direct Node.js access.

`filesystem:read`, `filesystem:write`, and `network:access` privileges govern
only Core-provided facades. Environmental claims explain package behavior; they
do not claim a sandbox.

### Policy scopes and visible startup reporting

Denials accumulate across global, plugin-ID, and exact-instance scopes. Unknown
privileges, claims, plugin IDs, or instance IDs in a policy are configuration
errors rather than ignored typos. A denied active request fails before static
effects; inactive capability-conditioned requests remain visible but do not
fail.

When no custom logger is configured, `UltimaBase` emits one concise console
startup report listing every flattened plugin instance, version, requested
privilege, reason, severity, conditional state, environmental claim, and policy
result. Applications may replace or explicitly silence that logger. Denials use
the error channel and are aggregated before failure. Options, secrets, raw
credentials, capability values, and stack traces never enter the report.

### Stable diagnostic boundary

Core adds stable framework codes for kernel failures:

- `PLUGIN_PRIVILEGE_DENIED`;
- `PLUGIN_CAPABILITY_MISSING`;
- `PLUGIN_CAPABILITY_CONFLICT`;
- `PLUGIN_PROTOCOL_INCOMPATIBLE`;
- `PLUGIN_DECLARATION_INVALID`;
- `PLUGIN_OPERATION_INVALID`;
- `PLUGIN_ADAPTER_CAPABILITY_MISSING`.

Community domain failures use `PluginError<TPluginCode>`, where the public code
is namespaced by the owning plugin and the safe payload follows the same public
message, public details, and retryability rules as `FrameworkError`. Unknown
exceptions remain internal errors. Transports never serialize diagnostic
details or plugin options implicitly.

## Consequences

- Developers can review and deny a stable, documented power vocabulary before
  effects begin.
- Startup reporting is visible by default and distinguishes enforceable host
  powers from unverifiable Node.js behavior.
- Community operations can expose stable safe errors without opening Core's
  framework-code union to arbitrary strings.

## Non-goals

- OS, Worker, module-loader, filesystem, network, or native-code sandboxing.
- Interactive privilege approval or a lockfile.
- Making critical privileges default-deny in this milestone.
