# @ultimabase/roles

Official `rolePermissionPlugin` and immutable `Role` domain class.

The plugin owns role persistence contracts, direct and nested membership, cycle prevention, role-reference resolution by UUID or unique name, and role lookup for other permission plugins.

Role administration is master-only by default and hidden from generated transports unless explicitly exposed.
