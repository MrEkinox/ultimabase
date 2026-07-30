# @ultimabase/access

Foundational contracts shared by access-control plugins.

This package defines access modes, declarative rule AST contracts, subjects, and compiler boundaries. It does not enforce CLP, ACL, roles, or field permissions by itself.

Keeping neutral contracts here prevents concrete permission plugins from depending on one another or on infrastructure.
