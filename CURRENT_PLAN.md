# Current plan

## Objective

Milestone 19 replaces schema and field `extensions` with the existing direct
plugin-option, plugin-field, patch, and capability vocabulary. The final public
schema API has no generic extension container or extension-specific helper.

## Order

1. Issue 1901 — decide the direct replacement contract and removal boundary (`completed`).
2. Issue 1902 — add option-presence schema selection over ordinary patches (`completed`).
3. Issue 1903 — migrate ACL to a direct schema option (`completed`).
4. Issue 1904 — migrate PostgreSQL naming metadata to direct options (`completed`).
5. Issue 1905 — remove the RoleSchema extension marker (`completed`).
6. Issue 1906 — delete the generic schema and field extension system (`completed`).
7. Issue 1907 — verify the extension-free public vertical (`completed`).

## Resume point

Milestone 19 is complete. There is no active implementation issue; wait for
explicit direction before selecting another objective. ACL hardening issues 432
through 435 remain deliberately deferred until that direction is given.
