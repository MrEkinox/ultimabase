export { hasRole } from './role-access.js'
export type { RoleAccessDecision } from './role-access.js'
export { RoleDeletionError } from './role-deletion.js'
export {
	onRoleEvent,
	provideRoleEventObserver,
	roleDeletedEvent,
	roleHierarchyChangedEvent,
	roleMembershipChangedEvent,
} from './role-events.js'
export type {
	RoleDeletedEvent,
	RoleHierarchyChangedEvent,
	RoleMembershipChangedEvent,
} from './role-events.js'
export { rolesPlugin } from './plugin.js'
export type { RolesPlugin } from './plugin.js'
export type { RoleMemberCommands, RoleMemberTarget } from './role-member.js'
export {
	RoleHierarchyError,
	roleHierarchyMaxDepth,
	roleHierarchyMaxVisitedRoles,
} from './role-hierarchy.js'
export type {
	NestedRoleTarget,
	RoleHierarchyCommands,
} from './role-hierarchy.js'
export {
	RoleReferenceResolutionError,
	resolveRoleReference,
	resolveRoleReferenceId,
} from './role-resolution.js'
export { RoleSchema, rolesPluginName } from './role-schema.js'
export type {
	ReservedRoleFieldName,
	RoleCurrentMemberInput,
	RoleDeletionOptions,
	RoleMemberOptions,
	RoleReferenceDeletionPolicy,
	RoleSchemaClass,
	RoleSchemaFields,
	RoleSchemaOptions,
	RoleSchemaSelfDefinition,
	RoleSchemaStatics,
} from './role-schema.js'
export type {
	RoleIdSelector,
	RoleNameSelector,
	RoleReference,
	RoleSelector,
} from './role-reference.js'
