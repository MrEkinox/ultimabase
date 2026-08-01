# Milestone 4 — Access plugins

Implement roles, CLP, ACL, and field permissions as independent plugins.

Implementation is intentionally scheduled after the native hook lifecycle and
policy-neutral enforcement boundary in the active plan. This allows permission plugins to use stable hook targets while
keeping Runtime unaware of CLP, ACL, roles, and field permissions. Permission
plugins attach guards, adapter constraints, and field restrictions through the
native hook dispatcher from ADR-0090. It is an execution priority, not a package
dependency: access contracts remain database-neutral.
