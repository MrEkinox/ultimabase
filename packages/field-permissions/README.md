# @ultimabase/field-permissions

Official `fieldPermissionPlugin`.

Typed field extensions control `read`, `create`, and `update`. Unreadable fields are removed from database selection. Explicitly selecting a forbidden field fails, and forbidden writes are always rejected rather than silently discarded.

Context-dependent GraphQL fields are nullable at the transport boundary even when their stored value is required.
