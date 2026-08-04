# Access control

## Native Access

```text
schema operation decision
AND schema row filter
AND schema item decision
AND field decisions
AND optional provider policies
```

`schema.access` is the generalized class-level permission API. It protects
singular and collection reads, counts, existence checks, creates, updates,
upserts, deletes, row visibility, and prepared items without installing a
permission plugin.

`field.access` controls item output, filtering, ordering, create input, and
update input. Forbidden columns are not selected. Explicit forbidden field use
returns a typed error.

Every independent declaration and provider contribution combines monotonically
through logical `AND`; no later policy can broaden an earlier restriction.

## ACL

ACL is an optional persisted per-object Access provider. It grants object
operations to anonymous or plugin-provided subjects and contributes row, item,
and field restrictions without overriding native schema or field Access.

One immutable ACL may grant `read`, `update`, `delete`, and `manageAcl` to
public access, any authenticated principal, any number of exact schema-qualified
principal Pointers, and any number of schema-qualified roles. Symmetric grant,
revoke, replace, and inspection methods never perform persistence or subject
resolution.

ACL values expose a versioned detached `toJSON()` document and strict
`ACL.fromJSON(unknown)` reconstruction. PostgreSQL stores an adapter-owned JSONB
representation directly on each protected row and indexes it with GIN, so ACL
filtering adds no ACL-table join.

## Roles

Role schemas have UUIDs, unique normalized names, developer-defined fields,
exact member schemas, and role members. Nested membership cycles are rejected.
Authentication may provide one exact current-principal Pointer and roles may
provide membership through separate neutral Core services. Installing either
provider grants no operation by itself, and ACL imports neither concrete
package.

ACL accepts role UUID or name references, but persistence resolves and stores the UUID.

Referenced-role deletion supports `fail`, `preserve`, and `cascade`; the default is `fail`.

`acl()` is valid on a developer-defined RoleSchema. Normal RoleSchema Access
still controls creation, while per-role ACL rights may narrow reads, updates,
membership or hierarchy mutations, deletion, and ACL management. Internal role
membership resolution uses its existing trusted provider boundary so evaluating
a role grant never recurses through the ACL protecting that RoleSchema row.

## ACL input

Create and update accept the same immutable `ACL` value. The `acl()` schema
extension accepts one static or asynchronous default and one shared
`resolveInput` callback for both operations. A default factory receives the
field-resolved create candidate, optional current principal, and operation
context, so it may derive object grants from the data being inserted. The
complete row is revalidated before Access. Updating an existing ACL requires
`manageAcl`, and the field is visible only with that right.

Master is trusted execution authority rather than an ACL subject. It bypasses
ACL authorization but not validation, default generation, hooks, transactions,
database constraints, or audit events.
