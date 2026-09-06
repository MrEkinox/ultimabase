# Examples

Examples are user-facing, tested applications. They must only import public `@ultimabase/*` exports.

- [`minimal`](minimal/README.md): runnable authenticated Hono and REST
  application on port `1337` with PostgreSQL, Password Auth Bearer and cookie
  sessions, role-protected data, audited Master requests, and explicitly
  exposed plugin operations.
- [`todo-backend`](todo-backend/README.md): complete backend Todo application showing Access, ACL, Hooks, Roles, PostgreSQL, typed operations, and the generated Typegen declaration.
