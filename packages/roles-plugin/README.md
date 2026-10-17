# @ultimabase/roles-plugin

Official roles: `App.RoleSchema.define(...)` role schemas, memberships and
inheritance, with `hasRole()` predicates that Access, ACL and other policy
plugins accept.

## Installation

```sh
npm install @ultimabase/roles-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin; Access is optional.

## Example

Reading the current roles, from the tested
[`examples/roles`](../../examples/roles/README.md) application:

<!-- region ../../examples/roles/tests/membership.test.ts#membership -->

```ts
await includeAdministratorsInEditors()
await addStaffMember('editor', ada.id)
await addStaffMember('administrator', grace.id)

const roles = ultimabase.plugin(rolesPlugin)
const adaRoles = await t.as(Member.pointer(ada.id), () =>
	roles.current(StaffRole),
)
const graceRoles = await t.as(Member.pointer(grace.id), () =>
	roles.current(StaffRole),
)
```

<!-- endregion -->

## Documentation

- [Roles](../../apps/website/content/docs/1.0.0/plugins/official/roles.mdx)
- [Access](../../apps/website/content/docs/1.0.0/plugins/official/access.mdx)
- [ACL Permissions](../../apps/website/content/docs/1.0.0/plugins/official/acl-permissions.mdx)
