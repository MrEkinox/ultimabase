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

## Roles

Role schemas have UUIDs, unique normalized names, developer-defined fields,
exact member schemas, and role members. Nested membership cycles are rejected.
Authentication and roles provide typed request subjects; installing either
provider grants no operation by itself.

ACL accepts role UUID or name references, but persistence resolves and stores the UUID.

Referenced-role deletion supports `fail`, `preserve`, and `cascade`; the default is `fail`.

## ACL input

Create and update accept the same immutable `ACL` value. Schema configuration chooses `default-only`, `client`, or `master-only` create behavior. Updating an existing ACL requires `manageAcl`.
