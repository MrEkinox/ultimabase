# ADR-0216: Direct plugin options may be compiler-only

- Status: accepted
- Date: 2026-08-21
- Refines: ADR-0198, ADR-0213
- Depends on: ADR-0192, ADR-0198, ADR-0213

## Context

Specialized factories may need an unforgeable direct option occurrence so Core
can require the owning plugin and retain provenance. `RoleSchema.define()` uses
such a package-created marker. Every direct option previously required a public
Typegen reference, which made this internal marker appear in ordinary
`Schema.define()` autocomplete even though application code could not construct
its nominal value.

Opaque option values solve serialization and callback safety, not authoring
visibility. Treating every opaque option as hidden would also remove legitimate
public callback-bearing options.

## Decision

`defineSchemaOption()` accepts `typegen: false` for compiler-only options.
Core still resolves the exact owner, normalizes the value, records provenance,
passes the inert visibility fact through the replaceable schema-compiler IR,
and runs any declared Runtime compiler. The application Typegen graph excludes
only the public option augmentation for that definition.

Compiler-only options are intended for values inserted by specialized
factories. Developer-authored direct options continue to declare a structured
public Typegen reference. `valueKind: 'opaque'` remains independent and does
not imply either visibility.

The Roles identity marker becomes compiler-only. Its nominal value type is no
longer exported, while registering a `RoleSchema` without `rolesPlugin()` still
fails static compilation.

## Consequences

- Internal marker names and unconstructable values do not pollute schema or
  field autocomplete.
- Community plugins can build specialized factories without inventing a second
  metadata or registry path.
- JavaScript, static compilation, provenance, plugin requirements, Runtime
  compilers, and schema patches remain unchanged.
- Generated fingerprints change only when the resulting public application
  declaration changes; compiler-only configuration is not Runtime truth in a
  generated file.
