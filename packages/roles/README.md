# @ultimabase/roles

Official optional `rolePermissionPlugin` provider and immutable `Role` domain
class.

The plugin owns role persistence contracts, relation-backed direct and nested
membership, cycle prevention, role-reference resolution by UUID or unique name,
and the neutral subject-resolution capability consumed by other permission
providers.

Role administration is master-only by default and hidden from generated transports unless explicitly exposed.
