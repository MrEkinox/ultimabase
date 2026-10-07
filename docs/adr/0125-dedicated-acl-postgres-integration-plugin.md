# ADR-0125: Dedicated ACL and PostgreSQL integration plugin

- Status: superseded
- Date: 2026-08-04
- Refines: ADR-0103, ADR-0122, ADR-0124
- Superseded by: ADR-0212

## Context

The ACL provider emits one portable, versioned database constraint and stores
its value through a portable plugin-field codec. PostgreSQL owns the concrete
JSONB representation and its protected constraint compiler contract. Neither
package may import the other without coupling a database-neutral policy to one
adapter or teaching the adapter about one optional policy.

Application composition therefore needs one explicit owner for the bridge.
That owner must also preserve fail-closed compiler registration, deterministic
plugin ordering, and the repository rule that optional plugins are immediately
recognizable by package name.

## Decision

`@ultimabase/acl-postgres-plugin` is the optional integration package between
`@ultimabase/acl-permissions-plugin` and `@ultimabase/postgres-plugin`. It
depends on both plugin names, validates ACL's exact opaque payload version, and
registers one PostgreSQL constraint compiler during application setup.

The compiler receives already-resolved portable subject identifiers. It never
reads authentication state, Core authority, a role graph, or database rows.
For one requested ACL permission, it emits parameterized JSONB containment
alternatives for:

- public grants;
- authenticated grants when an exact current principal exists;
- the exact schema-qualified principal;
- every resolved stable role reference.

PostgreSQL combines those alternatives with logical `OR`, then combines the
result with the developer query, native Access filters, and every other
provider constraint using logical `AND`. The PostgreSQL compiler facade exposes
an opaque `anyOf()` helper so integrations can compose safe predicates without
receiving Drizzle or raw SQL values.

The integration owns no connection, schema, authority, lifecycle, or Access
policy. Master bypass remains owned by the ACL provider: no ACL constraint is
emitted on that audited path, so the integration has nothing to compile.

Applications opt in explicitly:

```ts
new UltimaBase({
	schemas: [Post],
	plugins: [aclPlugin(), postgresPlugin({ url }), aclPostgresPlugin()],
})
```

## Consequences

- ACL remains usable with another adapter without importing PostgreSQL.
- PostgreSQL remains usable without ACL-specific code or configuration.
- Missing integration fails closed when PostgreSQL encounters an ACL node.
- Package dependencies make the concrete policy/adapter combination explicit.
- Future adapter integrations can follow the same package pattern without
  changing Core, Runtime, or the neutral ACL provider.

## Supersession

Issue 1804 completed ADR-0212's atomic migration. ACL authorization and
reference discovery now use field-owned portable containment leaves in
ordinary protected row filters, and the dedicated integration package no
longer exists.
