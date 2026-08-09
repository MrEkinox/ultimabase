export { hasRole } from './role-access.js'
export type { RoleAccessDecision } from './role-access.js'
export { roleDeletedEvent, RoleDeletionError } from './role-deletion.js'
export type { RoleDeletedEvent } from './role-deletion.js'
export {
	roleHierarchyChangedEvent,
	roleMembershipChangedEvent,
	rolesPlugin,
} from './plugin.js'
export type {
	RoleHierarchyChangedEvent,
	RoleMembershipChangedEvent,
	RolesPlugin,
	RolesPluginExports,
} from './plugin.js'
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
export {
	RoleSchema,
	roleSchemaExtensionName,
	rolesPluginName,
} from './role-schema.js'
export type {
	ReservedRoleFieldName,
	RoleCurrentMemberInput,
	RoleDeletionOptions,
	RoleMemberOptions,
	RoleReferenceDeletionPolicy,
	RoleSchemaBuilderOptions,
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
