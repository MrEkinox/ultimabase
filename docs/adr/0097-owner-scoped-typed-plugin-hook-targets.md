# ADR-0097: Owner-scoped typed plugin hook targets

- Status: accepted
- Date: 2026-08-02
- Refines: ADR-0048, ADR-0070, ADR-0089, ADR-0090, ADR-0096

## Context

Native schema and field declarations give application developers precise hook
typing, but plugins also need to attach the same behavior without enumerating
every schema or leaking plugin configuration into Runtime inputs. A policy
plugin, for example, must discover only the schemas and fields carrying its
opaque extensions, while a community field plugin must retain its exact logical
value type when targeting its namespaced field kind.

The generic setup contribution registry from ADR-0048 uses category-wide names.
Typed hooks instead need reusable names local to one plugin, exact target
validation, and a registration window that closes before infrastructure starts.

## Decision

### Setup facade and target scopes

Every `PluginSetupContext` exposes an owner-bound `hooks` facade. It supports six
target methods:

- `global(name, hooks)` targets every application schema;
- `schema(name, schema, hooks)` targets one exact application-owned schema;
- `field(name, schema, path, hooks)` targets one exact typed field path;
- `schemaExtension(name, extension, factory)` targets every schema carrying one
  extension owned by the setup plugin;
- `fieldExtension(name, extension, factory)` targets every field carrying one
  extension owned by the setup plugin;
- `fieldKind(name, target, factory)` targets every field carrying one typed,
  namespaced community field kind.

Exact field paths are non-empty readonly segment tuples. TypeScript resolves the
terminal field definition through nested object fields, so handlers retain its
logical value. Runtime initialization validates exact schema identity and every
path segment; dot-string parsing is not introduced.

`defineFieldKindHookTarget<TField>(kind)` creates the public field-kind selector.
The framework retains its provenance privately, which prevents arbitrary
objects from posing as typed targets. Namespaced field-kind validation remains
the same as for community field declarations.

### Initialization factories

Extension and field-kind targets are expanded only after every plugin setup
callback has completed. Their factories run once for each deterministic match
and receive initialization metadata:

- schema extension factories receive the schema and exact extension;
- field extension factories receive the schema, field, path, and exact
  extension;
- field-kind factories receive the schema, exact typed field, and path.

A factory may read configuration and close over the values needed by the hook
it returns. Extension configuration and target metadata are never injected into
native Runtime hook inputs. Runtime therefore executes the same `SchemaHooks`
and `FieldHooks` contracts for developer and plugin declarations.

### Ownership, identity, and lifetime

The typed facade fixes ownership to the plugin currently running setup. Hook
identity is the pair `(ownerPlugin, localName)`: two plugins may use the same
local name, while a duplicate from one owner fails with `PLUGIN_CONFLICT`.
Generic contribution registries retain their existing category-wide name
behavior; this refinement applies only to typed facades that explicitly opt
into plugin-local identity.

The setup registration window closes after the final setup callback, including
failure cleanup. Late writes fail before any infrastructure lifecycle phase.
Target resolution then validates foreign schemas, invalid paths, foreign
extensions, and framework-created field-kind target provenance. Resolved
matches and contribution lists are immutable and isolated per application.

Plugin dependencies determine setup order, configuration position breaks graph
ties, and local registration order is retained. Target expansion follows schema
registration order and deterministic nested field traversal. Numeric priorities
are not added.

Typed plugin contributions remain separate from developer-owned declarations.
The dispatcher introduced by issue 330 appends them; no plugin can replace a
schema or field's native hooks. The target API contains no CLP, ACL, role, or
field-permission discriminant.

## Consequences

- Plugin authors get one concise setup API for exact and declarative targets.
- Opaque extension configuration remains an initialization concern and does not
  widen Runtime callback hovers.
- Community field plugins preserve exact field values through a reusable,
  provenance-checked selector.
- Plugin-local names avoid unrelated cross-plugin conflicts without weakening
  duplicate detection inside one owner.
- Registration and target expansion are complete before infrastructure starts;
  execution remains the responsibility of the application-owned native hook
  dispatcher.
