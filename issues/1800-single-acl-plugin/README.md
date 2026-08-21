# Milestone 18 — Portable plugin containment and one ACL plugin

- Status: planned

Remove the PostgreSQL-specific ACL bridge without coupling ACL to PostgreSQL or
teaching PostgreSQL about ACL. The milestone first gives JSON-backed plugin
fields an explicit, typed opt-in to the existing portable `contains` Query
operator. PostgreSQL then compiles that ordinary Query AST generically before
ACL migrates both authorization and reference discovery onto protected row
filters and deletes `@ultimabase/acl-postgres-plugin` atomically.

The final application installs only `aclPlugin()` and its selected database
plugin. Community field plugins gain the same portable containment facility;
Core and adapters retain no ACL vocabulary, and the milestone does not create
an arbitrary custom-operator registry.

## Execution order

1. [ ] [1801 — Decide field-owned portable containment](1801-field-owned-portable-containment-adr.md)
2. [ ] [1802 — Expose typed containment for JSON-backed plugin fields](1802-plugin-field-containment-contract.md)
3. [ ] [1803 — Compile portable plugin containment in PostgreSQL](1803-postgres-plugin-field-containment.md)
4. [ ] [1804 — Migrate ACL and remove its PostgreSQL bridge](1804-single-acl-plugin-migration.md)
5. [ ] [1805 — Verify the single-plugin ACL vertical](1805-single-acl-plugin-verification.md)

Issues are deliberately ordered. In particular, issue 1804 owns the complete
ACL migration and bridge-package deletion in one commit so no repository state
silently drops PostgreSQL enforcement or leaves an empty publishable plugin.
