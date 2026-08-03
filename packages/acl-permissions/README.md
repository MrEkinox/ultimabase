# @ultimabase/acl-permissions

Official `aclPermissionPlugin` Access provider and immutable `ACL` class.

ACL grants object-level `read`, `update`, `delete`, and `manageAcl` rights to
public, authenticated, user, and role subjects. It contributes native Access
filters, item checks, and field restrictions that compile into database
filtering rather than post-filtering in memory.

Create and update use the same ACL value. Schema extensions choose whether transport create inputs use defaults, accept client ACL, or require master access.
