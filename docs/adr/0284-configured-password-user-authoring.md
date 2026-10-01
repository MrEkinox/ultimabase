# ADR-0284: Password User declarations accept the configured schema namespace

- Status: accepted
- Date: 2026-10-01
- Refines: ADR-0279 and ADR-0254
- Approval: user approved aligning PasswordUserSchema with RoleSchema's configured form
- Decision issue: [6319](../../issues/6300-source-typed-application-authoring/6319-configured-password-user-schema.md)

## Context

`PasswordUserSchema.define(options)` receives its plugin field builders through
generated interfaces. Removing those interfaces in 6313 broke a valid User
declaration containing `field.vector()`. RoleSchema already accepts a configured
schema namespace that carries plugin source types.

A previous experiment also attempted to move exact User results to source
inference and lost custom fields on `User.findMany()`. Those results remain in
the existing Typegen graph by explicit user decision.

## Decision

Password Auth accepts `PasswordUserSchema.define(Base.Schema, options)` through
the same configured field-declaration and option-validation types used by Roles.
The supplied namespace determines builder and local option types. It does not
register schemas, execute plugins, or introduce another compiler.

The existing `Schema.defineSpecialized()` path still creates the class exactly
once, injects the immutable unique username, validates reserved fields, attaches
authentication helpers and private identity, and freezes the class. Runtime
rejects a forged namespace as Roles does.

The return type remains `PasswordUserDefinition<TFields>`. Signup input derives
from the declared fields; exact query and authentication results continue to use
the generated User contract. No model-reference bridge or second graph is added.

The standalone form and default PasswordUser remain supported, matching Roles.
They retain their generated builder/option dependency. This additive decision
does not authorize removal of their valid plugin authoring capabilities; issue
6313 must classify those consumers before deleting a generated projection.

## Consequences

Configure schema plugins first, declare User using that namespace, then add
`passwordAuthPlugin({ user: User })` and explicitly register the custom User.
This order also supports separate schema files without a runtime import cycle.
The change improves configured authoring immediately but does not by itself
eliminate all generated builders or exact User result declarations.
