import {
	definePlugin,
	defineEvent,
	Pointer,
	accessReferenceCleanupCapability,
	accessRoleResolverCapability,
	optionalCapability,
	provideCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CompiledSchemaRegistry,
	type HookContext,
	type HookEventContract,
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

import { getRoleSchemaDeclaration, rolesPluginName } from './role-schema.js'
import {
	assertRoleHierarchyAcyclic,
	readPersistedRoleId,
} from './role-hierarchy.js'
import {
	applyRoleDeletionPolicy,
	type NamedRoleReferenceCleanup,
} from './role-deletion.js'
import { createStoredRoleResolver } from './role-access.js'

const optionalReferenceCleanups = optionalCapability(
	accessReferenceCleanupCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const readRoleSchemas = (
	schemas: CompiledSchemaRegistry,
): readonly SchemaDefinition[] =>
	schemas
		.values()
		.filter((schema) => getRoleSchemaDeclaration(schema) !== undefined)

const roleResolverProvider = provideCapability(accessRoleResolverCapability, {
	contributionId: 'stored-roles',
	create: ({ schemas }) => ({
		value: createStoredRoleResolver(readRoleSchemas(schemas)),
	}),
})

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

const roleMembershipChangedEventContract: HookEventContract<
	typeof roleMembershipChangedEvent,
	RoleMembershipChangedEvent,
	'optional'
> = defineEvent<RoleMembershipChangedEvent>()(roleMembershipChangedEvent, {
	delivery: 'optional',
})

/** Names the post-commit event emitted for every nested-role edge change. */
export const roleHierarchyChangedEvent =
	'ultimabase.roles.hierarchy.changed' as const

/** Describes one committed change to a generated child-role relation. */
export interface RoleHierarchyChangedEvent extends JsonObject {
	readonly action: RelationMutationAction
	readonly childRoleIds: readonly string[]
	readonly roleId: string
}

const roleHierarchyChangedEventContract: HookEventContract<
	typeof roleHierarchyChangedEvent,
	RoleHierarchyChangedEvent,
	'optional'
> = defineEvent<RoleHierarchyChangedEvent>()(roleHierarchyChangedEvent, {
	delivery: 'optional',
})

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

/** Queues audit-ready data for delivery only after Runtime confirms the commit. */
const emitRoleRelationChanges = (
	context: HookContext,
	operation: unknown,
	item: unknown,
): void => {
	const changes = readRoleRelationChanges(operation)

	if (changes.length === 0) {
		return
	}

	const roleId = readPersistedRoleId(item)

	for (const change of changes) {
		if (change.field === 'members') {
			const payload: RoleMembershipChangedEvent = immutableRecord({
				action: change.action,
				memberIds: change.targetIds,
				roleId,
			})

			context.emit(roleMembershipChangedEventContract, payload)
			continue
		}

		const payload: RoleHierarchyChangedEvent = immutableRecord({
			action: change.action,
			childRoleIds: change.targetIds,
			roleId,
		})

		context.emit(roleHierarchyChangedEventContract, payload)
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
	undefined,
	'0.0.0',
	'^0.0.0',
	readonly [
		Readonly<{
			readonly name: 'runtime:intercept'
			readonly reason: 'Maintains role references through native schema hooks.'
		}>,
		Readonly<{
			readonly name: 'event:publish'
			readonly reason: 'Publishes committed role membership and hierarchy changes.'
		}>,
	],
	undefined,
	Readonly<{
		readonly provides: readonly [
			CapabilityProviderDeclaration<typeof accessRoleResolverCapability>,
		]
		readonly optional: readonly [
			CapabilityRequirement<
				typeof accessReferenceCleanupCapability,
				true,
				'^1.0.0'
			>,
		]
	}>
>

/**
 * Discovers every registered `RoleSchema` and claims its private extension.
 *
 * Schema fields, hooks, Access, indexes, and transports stay in their native
 * declarations rather than becoming plugin options.
 */
export const rolesPlugin = (): RolesPlugin =>
	definePlugin({
		version: '0.0.0',
		core: '^0.0.0',
		pluginId: rolesPluginName,
		privileges: [
			{
				name: 'runtime:intercept',
				reason: 'Maintains role references through native schema hooks.',
			},
			{
				name: 'event:publish',
				reason: 'Publishes committed role membership and hierarchy changes.',
			},
		],
		capabilities: {
			optional: [optionalReferenceCleanups],
			provides: [roleResolverProvider],
		},
		setup: ({ capabilities, hooks, schemas }) => {
			const roleSchemas = readRoleSchemas(schemas)
			const readReferenceCleanups = (): readonly NamedRoleReferenceCleanup[] =>
				immutableArray(
					(capabilities.get(optionalReferenceCleanups) ?? []).flatMap(
						(contribution) => {
							if (contribution.cleanup.kind !== 'role') {
								return []
							}

							return [
								immutableRecord({
									cleanup: contribution.cleanup,
									name: contribution.name,
								}),
							]
						},
					),
				)

			for (const schema of roleSchemas) {
				const declaration = getRoleSchemaDeclaration(schema)

				if (declaration === undefined) {
					// Discovery and declaration lookup share one private WeakMap invariant.
					throw new TypeError('Discovered role schema lost its declaration')
				}

				hooks.schema(`membership-events:${schema.className}`, schema, {
					beforeOperation: {
						delete: async (input) => {
							const roleName: unknown = Reflect.get(input.originalItem, 'name')

							if (typeof roleName !== 'string') {
								throw new TypeError(
									'Prepared role deletion requires a role name',
								)
							}

							await applyRoleDeletionPolicy(
								input.context,
								schema,
								roleName,
								declaration,
								readReferenceCleanups(),
							)
						},
					},
					afterOperation: {
						update: async ({ context, item, operation }) => {
							const changes = readRoleRelationChanges(operation)

							if (changes.some(({ field }) => field === 'roles')) {
								await assertRoleHierarchyAcyclic(item)
							}

							emitRoleRelationChanges(context, operation, item)
						},
					},
				})
			}

			return Object.freeze({ schemas: Object.freeze(roleSchemas) })
		},
	})
