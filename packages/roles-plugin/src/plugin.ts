import {
	definePlugin,
	extensionHandlerKey,
	isAccessReferenceCleanup,
	onEvent,
	Pointer,
	accessRoleResolverServiceToken,
	type HookContext,
	type JsonObject,
	type RelationMutationAction,
	type FrameworkPlugin,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	getRoleSchemaDeclaration,
	rolesPluginName,
	roleSchemaExtensionName,
} from './role-schema.js'
import {
	assertRoleHierarchyAcyclic,
	readPersistedRoleId,
} from './role-hierarchy.js'
import {
	applyRoleDeletionPolicy,
	assertSingularRoleDeletion,
	roleDeletedEvent,
	type NamedRoleReferenceCleanup,
} from './role-deletion.js'
import { createStoredRoleResolver } from './role-access.js'

const masterOptions = Object.freeze({ useMasterKey: true })

/** Materializes relation capabilities that adapter results do not expose inside after hooks. */
const readUpdatedRoleModel = async (
	schema: SchemaDefinition,
	result: unknown,
): Promise<object> => {
	const roleId = readPersistedRoleId(result)
	const role = await new Pointer(schema, roleId).query().first(masterOptions)

	if (role === null) {
		throw new TypeError('Updated role disappeared before hierarchy validation')
	}

	return role
}

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

/** Names the post-commit event emitted for every nested-role edge change. */
export const roleHierarchyChangedEvent =
	'ultimabase.roles.hierarchy.changed' as const

/** Describes one committed change to a generated child-role relation. */
export interface RoleHierarchyChangedEvent extends JsonObject {
	readonly action: RelationMutationAction
	readonly childRoleIds: readonly string[]
	readonly roleId: string
}

interface RoleRelationChange {
	readonly action: RelationMutationAction
	readonly field: 'members' | 'roles'
	readonly targetIds: readonly string[]
}

/** Reads generated role relation deltas without trusting arbitrary update nodes. */
const readRoleRelationChanges = (
	operation: unknown,
): readonly RoleRelationChange[] => {
	if (
		!isPlainRecord(operation) ||
		operation.kind !== 'update-one' ||
		!isPlainRecord(operation.update) ||
		!isUnknownArray(operation.update.operations)
	) {
		return immutableArray([])
	}

	const changes: RoleRelationChange[] = []

	for (const updateOperation of operation.update.operations) {
		if (
			!isPlainRecord(updateOperation) ||
			updateOperation.kind !== 'relation' ||
			(updateOperation.field !== 'members' &&
				updateOperation.field !== 'roles') ||
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

		const targetIds = updateOperation.value.targets.flatMap((target) =>
			Pointer.is(target) ? [target.id] : [],
		)

		changes.push(
			immutableRecord({
				action,
				field: updateOperation.field,
				targetIds: immutableArray(targetIds),
			}),
		)
	}

	return immutableArray(changes)
}

/** Emits audit-ready data only after Runtime confirms the outer commit. */
const emitRoleRelationChanges = (
	context: HookContext,
	operation: unknown,
	result: unknown,
): void => {
	const changes = readRoleRelationChanges(operation)

	if (changes.length === 0) {
		return
	}

	const roleId = readPersistedRoleId(result)

	for (const change of changes) {
		if (change.field === 'members') {
			const payload: RoleMembershipChangedEvent = immutableRecord({
				action: change.action,
				memberIds: change.targetIds,
				roleId,
			})

			context.emit(roleMembershipChangedEvent, payload)
			continue
		}

		const payload: RoleHierarchyChangedEvent = immutableRecord({
			action: change.action,
			childRoleIds: change.targetIds,
			roleId,
		})

		context.emit(roleHierarchyChangedEvent, payload)
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
		setup: ({ hooks, registries, schemas, services }) => {
			// Role notifications are optional; built-in sinks preserve standalone commands.
			for (const eventName of [
				roleDeletedEvent,
				roleHierarchyChangedEvent,
				roleMembershipChangedEvent,
			]) {
				registries.events.register(
					`role-notification-boundary:${eventName}`,
					onEvent({ name: eventName, handler: () => undefined }),
				)
			}
			registries.extensions.register(
				extensionHandlerKey('schema', roleSchemaExtensionName),
				getRoleSchemaDeclaration,
			)

			const roleSchemas = schemas
				.values()
				.filter((schema) => getRoleSchemaDeclaration(schema) !== undefined)

			services.provide(
				accessRoleResolverServiceToken,
				createStoredRoleResolver(roleSchemas),
			)
			const readReferenceCleanups = (): readonly NamedRoleReferenceCleanup[] =>
				immutableArray(
					registries.commands.values().flatMap((contribution) => {
						if (
							!isAccessReferenceCleanup(contribution.value) ||
							contribution.value.kind !== 'role'
						) {
							return []
						}

						return [
							immutableRecord({
								cleanup: contribution.value,
								name: contribution.name,
							}),
						]
					}),
				)

			for (const schema of roleSchemas) {
				const declaration = getRoleSchemaDeclaration(schema)

				if (declaration === undefined) {
					// Discovery and declaration lookup share one private WeakMap invariant.
					throw new TypeError('Discovered role schema lost its declaration')
				}

				hooks.schema(`membership-events:${schema.className}`, schema, {
					beforeDelete: ({ operation }) => {
						assertSingularRoleDeletion(operation)
					},
					afterUpdate: async ({ operation, result }) => {
						const changes = readRoleRelationChanges(operation)

						if (changes.some(({ field }) => field === 'roles')) {
							await assertRoleHierarchyAcyclic(
								await readUpdatedRoleModel(schema, result),
							)
						}
					},
					afterCommit: ({ context, operation, result }) => {
						emitRoleRelationChanges(context, operation, result)
					},
				})
				hooks.field(`deletion-policy:${schema.className}`, schema, ['name'], {
					beforeDelete: ({ context, value }) =>
						applyRoleDeletionPolicy(
							context,
							schema,
							value,
							declaration,
							readReferenceCleanups(),
						),
				})
			}

			return Object.freeze({ schemas: Object.freeze(roleSchemas) })
		},
	})
