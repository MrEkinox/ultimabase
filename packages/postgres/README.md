# @ultimabase/postgres

Official PostgreSQL database plugin using Drizzle internally and `pg` as the driver.

Responsibilities include schema, field, query, and access-rule compilation; CRUD; transactions; introspection; direct schema synchronization; indexes; constraints; and ACL storage support.

Without a migration plugin, `schemaPolicy` is `override`, `fail`, or `ignore`. No Drizzle type or builder is exported publicly.
