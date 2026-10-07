# ADR-0273: Plugin fields use one canonical family declaration

- Status: accepted
- Date: 2026-09-26
- Supersedes: ADR-0214's separate field-type authoring form
- Refines: ADR-0029, ADR-0033, ADR-0088, ADR-0244, ADR-0269, ADR-0271
- Approval: user authorized the field-family consolidation on 2026-09-26

## Context

Core exposes two nominal declarations for one application-local plugin field
graph. `definePluginFieldType()` declares Typegen metadata for a field without
a public builder. `defineFieldBuilderMethod()` declares contextual factories
and repeats the field kind, module, value type, and optional containment type
inside every context. The owner-bound registrar likewise exposes both
`declareType()` and `register()`.

Both forms already feed one registry. That registry converts builder contexts
back into the same field-type records used by Typegen while separately keeping
their Runtime builder methods. Plugin Kit adds a third name for the builder
factory even though Core remains the provenance and compilation authority.

The split preserves no independent capability. It makes authors choose an API
from implementation history, duplicates stable metadata, and leaves the Core
registry responsible for bridging the two representations.

## Decision

Core exposes `definePluginFieldFamily()` as the sole nominal declaration. A
family declares one namespaced `fieldKind`, its public Typegen value metadata,
and an optional builder with a non-empty subset of `stored`, `embedded`,
`virtual`, and `output` contexts.

Each builder context declares its exact factory and exported method type while
inheriting the family's kind and Typegen metadata. A context may explicitly
override both when one public method intentionally represents different field
kinds or values across contexts. This retains ADR-0244's independent contextual
contracts without making the common case repeat metadata.

The owner-bound `fields` facade exposes only `register(family)`. A family with
no builder contributes only its generated value contract. A family with a
builder contributes the existing resolved Runtime methods and the stored or
embedded value contracts derived from those contexts. Application inspection,
Typegen conflict behavior, contextual availability, ownership, and provenance
remain unchanged.

The separate factories, registrar operation, Plugin Kit alias, and internal
field-type definition module are removed. No compatibility adapter or parallel
representation is retained.

## Preserved capabilities

- Plugin fields may exist without a public builder, including ACL-owned fields.
- One method may support any non-empty subset of the four field contexts.
- Every context retains an exact factory, kind, method type, value type, module,
  and optional structural-containment type.
- Contexts may intentionally use different kinds and public value types.
- Core still rejects built-in method conflicts, duplicate owners, forged
  declarations, unsupported contexts, and factories returning another kind.
- Runtime field construction and Typegen consume the same application-local
  resolved graphs as before.

## Consequences

The common field plugin declares kind and value metadata once. Patch-only and
reserved fields use the same authoring concept by omitting `builder`; adding a
builder does not require changing registration APIs. Core, rather than Plugin
Kit, provides the complete minimal authoring path.

This is a source migration for plugin authors, but it removes alternate public
forms rather than product behavior. Existing generated declarations and
application inspection outputs keep their resolved shapes.

## Rejected alternatives

- Keeping the two factories as aliases would retain the authoring ambiguity.
- Adapting both old shapes into a new facade would add another bridge.
- Requiring one kind and value type for every context would remove ADR-0244's
  intentional contextual independence.
- Moving the canonical declaration to Plugin Kit would leave Core's direct
  plugin-authoring experience incomplete.
