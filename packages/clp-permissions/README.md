# @ultimabase/clp-permissions

Official `clpPermissionPlugin` Access provider.

CLP controls each schema operation independently: `find`, `get`, `count`, `exists`, `create`, `update`, and `delete`. Bulk operations reuse the corresponding singular rule.

Schema configuration is contributed through a typed `clpPermissions(...)`
extension. The plugin registers native Access operation policies rather than
business hooks. ACL, native rules, and every other provider remain combined
through logical `AND`, so none can override a denied CLP.
