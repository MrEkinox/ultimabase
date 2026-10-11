export { hasRole } from './role-access.js'
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
export type { RolesPlugin, RolesPluginFactory } from './plugin.js'
export type { RoleHasOptions, RolesPluginExports } from './role-queries.js'
export {
	RoleHierarchyError,
	roleHierarchyMaxDepth,
	roleHierarchyMaxVisitedRoles,
} from './role-hierarchy.js'
export {
	RoleReferenceResolutionError,
	resolveRoleReference,
	resolveRoleReferenceId,
} from './role-resolution.js'
export { rolesPluginId } from './role-schema.js'
export type {
	ReservedRoleFieldName,
	RoleCurrentMemberInput,
	RoleReferenceDeletionPolicy,
	RoleSchemaFactories,
	RoleSchemaFactory,
	RoleSchemaFactoryMembers,
	RoleSchemaFields,
	RoleSchemaOptions,
	RoleSchemaStatics,
	RoleSchemaStaticsSlot,
} from './role-schema.js'
export type {
	RoleIdSelector,
	RoleNameSelector,
	RoleReference,
	RoleSelector,
} from './role-reference.js'
