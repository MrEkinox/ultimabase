# ADR-0214: Plugin field types do not require public builders

- Status: accepted
- Date: 2026-08-21

## Context

ADR-0213 lets an authorized plugin patch a private logical field into schemas
selected by a direct option. Typegen still learned every plugin field value and
structural-containment type from `FieldBuilder` method declarations. A plugin
therefore had to expose a method that application developers must never call,
or its patch-created fields could not participate in generated models and
filters.

The ACL plugin demonstrates the mismatch: `{ acl: {} }` owns the field lifecycle
and the plugin injects the persisted `acl` field. A public `field.acl()` method
would let developers bypass that lifecycle and create ambiguous schemas.

## Decision

Core exposes `definePluginFieldType()` and the owner-bound
`fields.declareType()` declaration facade. The declaration associates one
namespaced `fieldKind` with public TypeScript exports for its logical value and,
when enabled by the field itself, its structural-containment operand.

The declaration is inert: it does not create a field, expose a builder method,
patch a schema, install Runtime behavior, or grant another privilege. It is
available only to plugins with active `schema:declare` authority and is stored
with application-local owner provenance.

`defineFieldBuilderMethod()` remains the concise path for ordinary public plugin
fields. Registering a builder method automatically contributes the same value
type declaration, so Typegen has one field-kind metadata model rather than two
independent contracts.

Typegen resolves plugin values from the complete application-local field type
graph and resolves generated builder methods from the narrower method graph.
Conflicting value declarations keep their deterministic owner-aware Typegen
failure. A field kind used by a compiled schema without a configured type
declaration remains unsupported.

## Consequences

- Patch-only and reserved plugin fields receive exact generated model, input,
  equality, and structural-containment types without misleading public methods.
- Removing the plugin removes both its direct option typing and its field value
  declaration from that application.
- Builder-based plugins need no additional declaration and keep their current
  developer experience.
- Core knows no ACL-specific field kind or TypeScript export.
- The public declaration is metadata, not a general schema mutation escape
  hatch; plugins still use explicit schema patches to contribute fields.
