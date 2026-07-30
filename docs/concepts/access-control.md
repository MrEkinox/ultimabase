# Access control

## Layers

```text
CLP
AND ACL
AND field access
```

CLP contains explicit rules for `find`, `get`, `count`, `exists`, `create`, `update`, and `delete`.

ACL grants `read`, `update`, `delete`, and `manageAcl` to public, authenticated, user, and role subjects.

Field rules control `read`, `create`, and `update`. Forbidden columns are not selected. Explicit forbidden selection and forbidden writes return typed errors.

## Roles

Roles have UUIDs, unique case-insensitive names, optional display names, user members, and role members. Nested membership cycles are rejected.

ACL accepts role UUID or name references, but persistence resolves and stores the UUID.

Referenced-role deletion supports `fail`, `preserve`, and `cascade`; the default is `fail`.

## ACL input

Create and update accept the same immutable `ACL` value. Schema configuration chooses `default-only`, `client`, or `master-only` create behavior. Updating an existing ACL requires `manageAcl`.
