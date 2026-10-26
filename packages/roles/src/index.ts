// `@ultimabase/roles` (D-123, D-126): the role model, roles inside roles, and
// the question whether a caller has a role.
export type { RoleFields, RoleThunk } from './define-role.ts'
export { defineRole } from './define-role.ts'
export type { Roles } from './plugin.ts'
export { hasRole, rolesOf, rolesPlugin } from './plugin.ts'
