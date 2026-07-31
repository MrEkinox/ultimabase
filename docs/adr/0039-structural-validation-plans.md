# ADR-0039: Structural validation plans reference declared fields

- Status: accepted
- Date: 2026-07-31
- Supersedes: ADR-0020
- Refines: ADR-0029, ADR-0032, ADR-0033, ADR-0038

## Decision

Schema compiles immutable create and update plans containing only behavior that
differs from the declared field tree. Every plan node records operation-specific
presence and nullability. Scalar nodes retain the exact declared field by
identity instead of copying its kind, constraints, defaults, or other options.

Object nodes additionally compile their operation-specific child plans and the
closed unknown-field policy. Array nodes represent each declared list dimension;
their scalar or object item uses required, non-null value semantics. An object
inside an updated list continues to use create rules because the list value is
replaced rather than patched.

Built-in and plugin-defined fields use the same scalar plan. Runtime and plugin
handlers discriminate the logical field through `plan.field.kind` and read its
immutable options from `plan.field.options`. A plugin-specific type guard may
narrow `ScalarValidationPlan<TField>` to retain the plugin's exact field type.

Only completed plan nodes, field maps, operation plans, and the plan pair are
frozen. Temporary compilation records are not public values and are not frozen.
Field factories remain the sole normalization and ownership boundary for static
defaults and constraint metadata.

Runtime executes the structural plan and the referenced field contract. It must
not rebuild a transport-specific or adapter-specific scalar schema from copied
plan metadata.

## Consequences

Adding a built-in scalar no longer requires a parallel validation-plan type or
compiler branch. Community fields survive planning through the same contract,
and Schema keeps one source of truth for scalar behavior.

The former scalar-specific plan types, plugin plan type, regular-expression plan
shape, and default plan descriptors are removed from the public API. Consumers
read those values from the referenced field instead.

Plans still compile once during application setup because create/update
presence, object patching, list replacement, and nested structure are useful
runtime decisions. The plan is therefore smaller without becoming a second
schema declaration language.
