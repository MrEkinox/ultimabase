# ADR-0280: Complete-schema callbacks use the retained Typegen graph

- Status: accepted
- Date: 2026-09-29
- Supersedes: ADR-0279 only where it assigned every plugin option to source projection
- Approval: user approved retaining Typegen when exact schema callback typing cannot be expressed safely from source
- Decision issue: [6307](../../issues/6300-source-typed-application-authoring/6307-official-plugin-source-typing.md)

## Context

ADR-0279 moved locally decidable plugin surfaces onto the configured application
factory while retaining Typegen for the application-wide schema-name graph.
Issue 6307 proved that field Access, field Hooks, Validation, ACL, and direct
schema selectors can use that source projection. It also exposed a narrower
limit for schema-level Access and Hooks.

An inline schema callback is contextualized while TypeScript is still inferring
the sibling `fields` declaration. Access row filters return a `WhereBuilder`
bound to the complete schema, while item callbacks and Hooks reference exact
persisted values, relations, operations, and plugin mutation names. TypeScript
first produces callbacks over the bootstrap schema and then rejects them when
the completed schema is substituted. Splitting field inference, recursively
validating the object, and resolving mutation projections before options did
not remove that generic-to-exact mismatch.

These callbacks depend on the same completed application graph already required
for circular and cross-file string relationships. Keeping a second source
registry or weakening callback types would add complexity or lose capability.

## Decision

The configured application factory remains the sole schema authoring API.
Locally decidable surfaces continue to come directly from installed plugin
definitions:

- Access and Hooks field options;
- Validation field options;
- ACL and Soft Delete schema options and contributed fields;
- plugin field builders, model/schema methods, operations, and specialized
  package schemas where their contracts do not require the completed name
  graph.

Schema-level `access` and `hooks` remain generated option descriptors in the
existing application Typegen graph. Their descriptors reference public package
types and the generated graph supplies exact schema fields, relationships, and
mutation identities. Typegen does not copy callbacks, validators, Runtime
behavior, or plugin implementation code.

This is one retained graph, not a compatibility bridge. Plugins still cannot
append manual declarations or extra outputs, and Runtime registration remains
the explicit `new App({ schemas: [...] })` list. JavaScript compiles and runs the
same policies and Hooks without loading generated declarations.

Configured source validation uses the generated schema contract only when the
class name exists in that graph. Before generation, local source options remain
available and Runtime compilation remains authoritative; after generation,
schema callback completion and diagnostics use the exact application contract.

## Consequences

- Developers keep one `App.Schema.define(...)` form; no callback, schema scope,
  registration API, or plugin installation form is added.
- Field-level plugin typing no longer expands per schema in generated output.
- Typegen retains two official schema option descriptors: `access` and `hooks`.
- Removing either descriptor requires a future proof that preserves exact
  callbacks without a second graph, weaker types, or circular inference.
- ADR-0279 remains authoritative for every other configured source surface and
  for the prohibition on parallel registries and Runtime truth in Typegen.

## Rejected alternatives

- Repeated source-only inference attempts are rejected after the bounded
  compiler proof failed on exact `WhereBuilder` and schema item types.
- Broad callback types are rejected because they lose field, relation, mutation,
  and authority diagnostics.
- Per-plugin source registries and late schema mutation are rejected because
  they duplicate the graph or change Runtime semantics.
- Requiring developers to split fields, Access, or Hooks into separate calls is
  rejected because it changes the approved one-object schema DX.
