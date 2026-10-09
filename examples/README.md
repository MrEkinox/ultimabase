# Examples

Examples are user-facing, tested applications. They must only import public `@ultimabase/*` exports.

- [`minimal`](minimal/README.md): runnable authenticated Hono application on
  port `1337` with sibling REST and GraphQL transports, PostgreSQL, Password
  Auth Bearer and cookie sessions, role-protected data, audited Master requests,
  both official soft-delete modes with private restoration and purge, atomic
  nested pointer and relation writes, and explicitly exposed plugin operations.
- [`todo-backend`](todo-backend/README.md): complete backend Todo application showing Access, ACL, Hooks, Roles, PostgreSQL, typed operations, and the generated Typegen declaration.
- [`schema-form-d`](schema-form-d/README.md): the declaration form without
  Typegen (ADR-0297) on cyclic schemas with Access, ACL, Hooks and Soft Delete,
  with its typo cases, editor probes and measurements.
