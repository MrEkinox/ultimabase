# Milestone 4 — Access plugins

Implement roles, CLP, ACL, and field permissions as independent plugins.

Implementation is intentionally scheduled after the native hook lifecycle and
policy-neutral enforcement boundary in the active plan. This allows permission plugins to use stable hook targets while
keeping Runtime unaware of CLP, ACL, roles, and field permissions. Permission
plugins attach guards, adapter constraints, and field restrictions through the
native hook dispatcher from ADR-0090. It is an execution priority, not a package
dependency: access contracts remain database-neutral.

Core authority is limited to anonymous and master execution under ADR-0113.
Authenticated, user, owner, and role subjects remain valid permission-domain
concepts, but access plugins resolve them through optional typed context values
or neutral services. Installing no authentication provider is valid until a
configured rule requires identity.

CLP and ACL are independent permission plugins: neither imports, installs, nor
depends on the other. Both may use the typed role contract because their public
configuration accepts role rules or subjects. That contract and its typed
service token live in `@ultimabase/access`; neither plugin imports or identifies
`rolePermissionPlugin`. A role-resolution provider becomes a conditional setup
requirement only when the normalized CLP or ACL configuration actually
references a role. Missing capability then fails before infrastructure starts.
