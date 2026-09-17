# ADR-0248: Application-selected plugin mutations on schema classes

- Status: accepted
- Date: 2026-09-17
- Refines: ADR-0192, ADR-0197, ADR-0201, ADR-0245

## Context

Plugin schema mutations previously appeared only on
`ultimabase.schema(Post)` and application-bound persisted models. Native
operations already allow `Post.createOne(input, { ultimabase })`, but the
plugin-owned counterpart required an extra handle at every class-level call.
The documentation of Soft Delete exposed this unnecessary difference.

An exported schema class can be reused by applications with different plugin
graphs. Binding a mutation to one default application, mutating its frozen
constructor or prototype, or treating generated declarations as Runtime truth
would break that isolation. The class-level name is therefore only a dispatcher;
the selected application remains the source of executable behavior.

## Decision

Every plugin schema mutation declared on the `schema` surface is also callable
on the class returned by `Schema.define()` after an owning `UltimaBase` starts:

```ts
await Post.softDelete({ id }, { ultimabase })
await Post.restore({ id }, { ultimabase, useMasterKey: true })
```

An active request can supply the application as it does for native class
operations. Outside that scope, the caller must pass `{ ultimabase }`. Core
validates exact class identity and the mutation's presence in that application's
compiled schema surface before delegating to the existing application handle.
The same Runtime, Access, Hooks, transaction, projection, cancellation, Master
audit, and disposal checks apply. No class-level dispatcher grants authority.

`Schema.define()` returns a Proxy over the frozen constructor. Only names of
schema mutations from successfully started applications are held in a weak map
keyed by that class. The Proxy exposes inert methods without changing the
constructor, prototype, model identity, or any plugin's implementation. Two
applications may contribute different method names to the same class; JavaScript
may then see their union. A call naming a mutation absent from the selected
application fails before request effects. No application, credential, executor,
or command handler is stored in the class-name map, and there is no default
application or last-writer-wins resolution.

Typegen projects only the selected application's schema mutation names and
exact input/result types onto its generated schema-class contract. It remains
replaceable declaration output; JavaScript dispatch uses the compiled graph.
The static name's visibility alone does not prove installation in a different
application within the same process.

## Consequences

- The source syntax matches native schema operations without removing the
  application handle or the persisted-model method.
- Shared-class method visibility is the narrow exception to ADR-0197's
  application-local _shape_. Executable ownership and all security checks
  remain application-local. A multi-application TypeScript project must treat
  generated class declarations as belonging to its selected graph and pass the
  intended `UltimaBase` explicitly when no request is active.
- Master-only restore and purge remain private direct commands: they acquire
  no model methods, Access branch, REST route, or GraphQL field.
- Arbitrary plugin schema commands and query extensions do not gain static
  class aliases. This decision covers the current schema-mutation contract,
  not a generic method registry or mutable Active Record API.
