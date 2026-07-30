# @ultimabase/clp-permissions

Official `clpPermissionPlugin`.

CLP controls each schema operation independently: `find`, `get`, `count`, `exists`, `create`, `update`, and `delete`. Bulk operations reuse the corresponding singular rule.

Schema configuration is contributed through a typed `clpPermissions(...)` extension. ACL never overrides a denied CLP.
