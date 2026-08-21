# Current plan

## Objective

Milestone 19 replaces schema and field `extensions` with the existing direct
plugin-option, plugin-field, patch, and capability vocabulary. The final public
schema API has no generic extension container or extension-specific helper.

## Order

1. Issue 1901 — decide the direct replacement contract and removal boundary (`ready`).
2. Issue 1902 — support option-owned structural schema contributions (`planned`).
3. Issue 1903 — migrate ACL to a direct schema option (`planned`).
4. Issue 1904 — migrate PostgreSQL naming metadata to direct options (`planned`).
5. Issue 1905 — remove the RoleSchema extension marker (`planned`).
6. Issue 1906 — delete the generic schema and field extension system (`planned`).
7. Issue 1907 — verify the extension-free public vertical (`planned`).

## Resume point

Start issue 1901. Do not implement a compatibility layer: UltimaBase is still
in development, and each replacement must remove its superseded public API in
the same issue. ACL hardening issues 432 through 435 remain deliberately
deferred until explicit direction.
