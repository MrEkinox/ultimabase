# ADR-0051: Plugin-owned extension handlers

- Status: accepted
- Date: 2026-07-31
- Refines: ADR-0002, ADR-0048, ADR-0050

## Decision

Every `SchemaExtension` and `FieldExtension` records a literal `pluginName` in
addition to its scope, name, and opaque configuration. The expected plugin name
defaults to the extension name. A third factory argument allows one plugin to
own several extension identities without introducing concrete permission,
database, or transport types into `@ultimabase/schema`.

Core identifies handlers with `${scope}:${extensionName}`. Plugins register the
handler through their owner-bound extension contribution registry using
`extensionHandlerKey(scope, extensionName)`. The recorded setup owner must equal
the extension's expected plugin. A second contribution for the same key is
rejected with `PLUGIN_CONFLICT`; configuration order never replaces a handler.

`FrameworkApplication.initialize()` validates every schema extension and every
field extension, recursively including object field children. Validation runs
after all plugin setup callbacks and before `connect`. A missing handler or a
handler owned by another plugin fails with
`PLUGIN_EXTENSION_HANDLER_MISSING`. Trusted diagnostics include the schema class,
field path when relevant, extension scope and name, expected plugin, and actual
owner when present.

## Consequences

Schema remains independent from concrete plugins while declarations state which
installed capability must interpret their metadata. Typos, omitted plugins, and
incomplete plugin setup fail before database connections or transport listeners
can start.

One handler identity may serve every occurrence of an extension across schemas
and nested fields. Plugins remain responsible for validating and applying their
own opaque configuration after Core establishes handler ownership.
