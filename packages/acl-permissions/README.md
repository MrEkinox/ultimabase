# @ultimabase/acl-permissions

Official `aclPermissionPlugin` and immutable `ACL` class.

ACL grants object-level `read`, `update`, `delete`, and `manageAcl` rights to public, authenticated, user, and role subjects. It is compiled into database filtering rather than post-filtered in memory.

Create and update use the same ACL value. Schema extensions choose whether transport create inputs use defaults, accept client ACL, or require master access.
