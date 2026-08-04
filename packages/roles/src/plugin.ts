import {
	definePlugin,
	extensionHandlerKey,
	Pointer,
	type HookContext,
	type JsonObject,
	type RelationMutationAction,
	type FrameworkPlugin,
	type SchemaDefinition,
} from '@ultimabase/core'
import { immutableArray, immutableRecord, isPlainRecord, isUnknownArray } from '@ultimabase/shared'

import {
	getRoleSchemaDeclaration,
	rolesPluginName,
	roleSchemaExtensionName,
} from './role-schema.js'

/** Exposes the application-local role domains discovered during setup. */
export interface RolesPluginExports {
	readonly schemas: readonly SchemaDefinition[]
}

/** Names the post-commit event emitted for every direct member-edge change. */
export const roleMembershipChangedEvent =
	'ultimabase.roles.membership.changed' as const

/** Describes one committed change to a generated member relation. */
export interface RoleMembershipChangedEvent extends JsonObject {
	readonly action: RelationMutationAction
	readonly memberIds: readonly string[]
	readonly roleId: string
}

const readResultId = (result: unknown): string | undefined => {
	if (typeof result !== 'object' || result === null) {
		return undefined
	}

	const id: unknown = Reflect.get(result, 'id')

	return typeof id === 'string' ? id : undefined
}

/** Emits audit-ready data only after Runtime confirms the outer commit. */
const emitRoleMembershipChanges = (
	context: HookContext,
	operation: unknown,
	result: unknown,
): void => {
	if (
		!isPlainRecord(operation) ||
		operation.kind !== 'update-one' ||
		!isPlainRecord(operation.update) ||
		!isUnknownArray(operation.update.operations)
	) {
		return
	}

	const roleId = readResultId(result)

	if (roleId === undefined) {
		return
	}

	for (const updateOperation of operation.update.operations) {
		if (
			!isPlainRecord(updateOperation) ||
			updateOperation.kind !== 'relation' ||
			updateOperation.field !== 'members' ||
			!isPlainRecord(updateOperation.value) ||
			!isUnknownArray(updateOperation.value.targets)
		) {
			continue
		}

		const action = updateOperation.value.action

		if (
			action !== 'clear' &&
			action !== 'connect' &&
			action !== 'disconnect' &&
			action !== 'set'
		) {
			continue
		}

		const memberIds = updateOperation.value.targets.flatMap((target) =>
			Pointer.is(target) ? [target.id] : [],
		)
		const payload: RoleMembershipChangedEvent = immutableRecord({
			action,
			memberIds: immutableArray(memberIds),
			roleId,
		})

		context.emit(roleMembershipChangedEvent, payload)
	}
}

/** Represents the option-light official stored-role provider. */
export type RolesPlugin = FrameworkPlugin<
	typeof rolesPluginName,
	RolesPluginExports,
	undefined,
	undefined,
	undefined,
	undefined,
	never
>

/**
 * Discovers every registered `RoleSchema` and claims its private extension.
 *
 * Schema fields, hooks, Access, indexes, and transports stay in their native
 * declarations rather than becoming plugin options.
 */
export const rolesPlugin = (): RolesPlugin =>
	definePlugin({
		name: rolesPluginName,
		setup: ({ hooks, registries, schemas }) => {
			registries.extensions.register(
				extensionHandlerKey('schema', roleSchemaExtensionName),
				getRoleSchemaDeclaration,
			)

			const roleSchemas = schemas
				.values()
				.filter((schema) => getRoleSchemaDeclaration(schema) !== undefined)

			for (const schema of roleSchemas) {
				hooks.schema(`membership-events:${schema.className}`, schema, {
					afterCommit: ({ context, operation, result }) => {
						emitRoleMembershipChanges(context, operation, result)
					},
				})
			}

			return Object.freeze({ schemas: Object.freeze(roleSchemas) })
		},
	})
