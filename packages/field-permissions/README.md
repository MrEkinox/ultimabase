# @ultimabase/field-permissions

Official `fieldPermissionPlugin` Access provider.

Typed field extensions control `read`, `filter`, `order`, `create`, and
`update` through Core's native Access field lifecycle. Unreadable fields are
removed from database selection. Explicit forbidden field use fails, and
forbidden writes are always rejected rather than silently discarded.

Context-dependent GraphQL fields are nullable at the transport boundary even when their stored value is required.
