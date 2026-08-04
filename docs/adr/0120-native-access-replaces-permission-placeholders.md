# ADR-0120: Native Access replaces permission placeholder packages

- Status: accepted
- Date: 2026-08-04
- Supersedes in part: ADR-0006, ADR-0090, ADR-0116

## Context

ADR-0006 originally separated CLP, ACL, roles, and field permissions into
independent plugins. ADR-0116 later introduced one native Core Access lifecycle
with schema operation, row-filter, item, and field decisions. That lifecycle
now implements the complete class-level and field-level behavior directly in
static schema declarations.

Keeping empty `@ultimabase/clp-permissions-plugin` and
`@ultimabase/field-permissions-plugin` workspaces would preserve two competing names
and suggest that ordinary authorization requires plugins. It would also force
documentation, transports, and future policy providers to distinguish APIs
that compile to the same Access plan without adding storage or context.

ACL differs because it persists grants on individual objects. Roles and
authentication also differ because they resolve reusable request subjects;
they do not grant operations merely by being installed.

## Decision

`schema.access` is UltimaBase's generalized class-level permission system. Its
`operation`, `filter`, and `item` declarations cover Parse-style CLP use cases
while retaining typed singular, bulk, count, existence, and row-restriction
semantics.

`field.access` is UltimaBase's field-permission system. It controls item output,
filtering, ordering, create input, and update input without a field extension or
permission plugin.

The `@ultimabase/clp-permissions-plugin` and
`@ultimabase/field-permissions-plugin` packages are removed before publication. Core
continues to compile native declarations and plugin-contributed policies into
one monotonic Access plan.

ACL remains an optional persisted per-object Access provider. It contributes
row filters, item decisions, and field restrictions through public Core Access
contracts and never replaces or broadens native schema or field declarations.

Roles and authentication remain optional context providers. A policy may use
their neutral subject capabilities, but installing either provider grants
nothing by itself. Community tenancy, ownership, moderation, and soft-delete
plugins may contribute additional monotonic Access policies through the same
registry.

Parse-compatible CLP object syntax is deferred to a future compatibility or
preset package. Such a package may translate its configuration into native
Access declarations; it does not define a second Runtime permission lifecycle.

## Consequences

- Ordinary schema and field authorization requires no permission plugin.
- Developers learn one Access vocabulary across direct queries and future REST
  or GraphQL transports.
- ACL remains independently installable because it owns persisted object data.
- Roles and authentication remain independently installable because they own
  request subject resolution rather than permission decisions.
- Removing the empty packages changes no Runtime behavior, schema metadata,
  migration output, inferred model type, or stored data.
- Historical ADRs remain unchanged as records of the earlier design; this ADR
  owns the newer package and terminology decision.
