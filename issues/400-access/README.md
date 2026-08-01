# Milestone 4 — Access plugins

Implement roles, CLP, ACL, and field permissions as independent plugins.

Implementation is intentionally scheduled after the native hook lifecycle in
issues 324–335. This allows permission plugins to use stable hook targets while
keeping CLP, ACL, and field permissions in reserved Runtime stages. It is an
execution priority, not a package dependency: access contracts remain
database-neutral.
