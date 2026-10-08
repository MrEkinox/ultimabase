# ADR-0283: Exact ACL schema callbacks use the retained Typegen graph

- Status: accepted
- Date: 2026-10-01
- Refines: ADR-0280's classification of ACL schema options as entirely source-typed
- Approval: user approved the existing Typegen fallback rather than repeating source-only inference attempts
- Decision issue: 6318 (archived at tag `reference-archive`: `issues/6300-source-typed-application-authoring/6318-migrate-schema-authoring-consumers.md`)

## Context

ADR-0280 retained generated schema-level Access and Hooks callback descriptors
after bounded source-only inference failed. It classified ACL's direct schema
option as locally source-typed. Issue 6318's migration exposed a gap in that
classification: `App.Schema.define()` offers `acl` before generation, but its
`default` and `resolveInput` callbacks see sibling `data` values as `unknown`.
The previous exact ACL type test used a test-local generated-options
augmentation on standalone `Schema.define()`. Changing between builder and
direct field factories did not recover the exact values.

## Decision

ACL keeps its direct source-owned schema option, Runtime normalization,
protected policy, and contributed field. Its option definition additionally
declares one public `ACLSchemaOption<this>` reference in the existing Typegen
schema-option graph. The generated graph contextualizes the callbacks against
the completed schema, restoring exact sibling fields and rejecting undeclared
fields. No ACL callback implementation or Runtime data is generated.

Before generation, the configured factory still exposes and validates the
option's local shape; completed sibling-field values require Typegen. The
developer continues to write one `App.Schema.define({ fields, acl })` object
and explicitly registers the schema with `new App({ schemas: [...] })`.
JavaScript uses the same compiled application without generated declarations.

## Consequences

- Typegen retains a third official complete-schema option descriptor: `acl`,
  alongside `access` and `hooks`. Its bytes and regeneration cost belong in
  issue 6316's final audit.
- The source-only promise for ACL callback sibling values is withdrawn; the
  rest of ACL's source-owned and Runtime contracts remain unchanged.
- This does not add a second registry, generated client, plugin-specific Core
  knowledge, automatic schema registration, or a second authoring form.
- Repeating equivalent source-inference attempts is out of scope without new
  TypeScript evidence and an explicit architecture decision.
