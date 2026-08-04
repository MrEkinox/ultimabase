import type {
	PersistedSchemaReference,
	Pointer,
	QueryTerminalOptions,
	Relation,
	SchemaDefinition,
	SchemaModelCapabilityContext,
} from '@ultimabase/core'

/** Accepts either a detached Pointer or any persisted projection of the member. */
export type RoleMemberTarget<TMemberSchema extends SchemaDefinition> =
	| Pointer<TMemberSchema>
	| PersistedSchemaReference<TMemberSchema>

interface RoleMemberCommandReceiver<
	TRoleSchema extends SchemaDefinition,
	TMemberSchema extends SchemaDefinition,
> extends PersistedSchemaReference<TRoleSchema> {
	relation(fieldName: 'members'): Relation<TRoleSchema, TMemberSchema>
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
		this: RoleMemberCommandReceiver<TRoleSchema, TMemberSchema>,
		member: RoleMemberTarget<TMemberSchema>,
		options?: QueryTerminalOptions,
	): Promise<void>
	/**
	 * Removes one exact persisted member through the generated relation lifecycle.
	 * Removing an absent membership succeeds without changing stored edges.
	 */
	removeMember(
		this: RoleMemberCommandReceiver<TRoleSchema, TMemberSchema>,
		member: RoleMemberTarget<TMemberSchema>,
		options?: QueryTerminalOptions,
	): Promise<void>
}

/** Creates thin model aliases without retaining an application or adapter. */
export const createRoleMemberCommands = <
	const TRoleSchema extends SchemaDefinition,
	const TMemberSchema extends SchemaDefinition,
>(
	context: SchemaModelCapabilityContext<TRoleSchema>,
	memberSchema: TMemberSchema,
): RoleMemberCommands<TRoleSchema, TMemberSchema> => ({
	addMember(member, options): Promise<void> {
		context.assertPersisted(this, 'addMember')
		const pointer = context.toPointer(memberSchema, member, 'addMember')

		return this.relation('members').connect(pointer, options)
	},
	removeMember(member, options): Promise<void> {
		context.assertPersisted(this, 'removeMember')
		const pointer = context.toPointer(memberSchema, member, 'removeMember')

		return this.relation('members').disconnect(pointer, options)
	},
})
