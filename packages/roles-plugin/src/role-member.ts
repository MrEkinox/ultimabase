import type {
	PersistedSchemaReference,
	Pointer,
	OperationOptions,
	SchemaDefinition,
	SchemaModelCapabilityContext,
} from '@ultimabase/core'

import type { RoleHierarchyCommands } from './role-hierarchy.js'

/** Accepts either a detached Pointer or any persisted projection of the member. */
export type RoleMemberTarget<TMemberSchema extends SchemaDefinition> =
	Pointer<TMemberSchema> | PersistedSchemaReference<TMemberSchema>

interface RoleMemberCommandReceiver<
	TRoleSchema extends SchemaDefinition,
> extends PersistedSchemaReference<TRoleSchema> {
	relation(fieldName: 'members'): {
		connect(memberId: string, options?: OperationOptions): Promise<void>
		disconnect(memberId: string, options?: OperationOptions): Promise<void>
	}
}

/** Adds concise member aliases only to persisted role results. */
export interface RoleMemberCommands<
	TRoleSchema extends SchemaDefinition,
	TMemberSchema extends SchemaDefinition,
> {
	/**
	 * Adds one exact persisted member through the generated relation lifecycle.
	 * Existing membership remains unchanged, making repeated addition idempotent.
	 */
	addMember(
		this: RoleMemberCommandReceiver<TRoleSchema>,
		member: RoleMemberTarget<TMemberSchema>,
		options?: OperationOptions,
	): Promise<void>
	/**
	 * Removes one exact persisted member through the generated relation lifecycle.
	 * Removing an absent membership succeeds without changing stored edges.
	 */
	removeMember(
		this: RoleMemberCommandReceiver<TRoleSchema>,
		member: RoleMemberTarget<TMemberSchema>,
		options?: OperationOptions,
	): Promise<void>
}

/**
 * Creates the member and child-role aliases of one role schema.
 *
 * Each command rejects drafts, converts its argument through Core's exact
 * Pointer conversion and delegates to the generated relation lifecycle, so
 * no application or adapter is retained.
 */
export const createRoleRelationCommands = <
	const TRoleSchema extends SchemaDefinition,
	const TMemberSchema extends SchemaDefinition,
>(
	context: SchemaModelCapabilityContext<TRoleSchema>,
	memberSchema: TMemberSchema,
): RoleMemberCommands<TRoleSchema, TMemberSchema> &
	RoleHierarchyCommands<TRoleSchema> => ({
	addMember(member, options): Promise<void> {
		context.assertPersisted(this, 'addMember')
		const pointer = context.toPointer(memberSchema, member, 'addMember')

		return this.relation('members').connect(pointer.id, options)
	},
	removeMember(member, options): Promise<void> {
		context.assertPersisted(this, 'removeMember')
		const pointer = context.toPointer(memberSchema, member, 'removeMember')

		return this.relation('members').disconnect(pointer.id, options)
	},
	addRole(role, options): Promise<void> {
		context.assertPersisted(this, 'addRole')
		const pointer = context.toPointer(context.schema, role, 'addRole')

		return this.relation('roles').connect(pointer.id, options)
	},
	removeRole(role, options): Promise<void> {
		context.assertPersisted(this, 'removeRole')
		const pointer = context.toPointer(context.schema, role, 'removeRole')

		return this.relation('roles').disconnect(pointer.id, options)
	},
})
