import {
	Pointer,
	requestSubjectReferenceCleanupCapability,
	requestRoleResolverCapability,
	materializeSchemaModel,
	optionalCapability,
	provideCapability,
	provideRuntimeBehavior,
	type runtimeBehaviorCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CompiledSchemaRegistry,
	type DatabaseOperationAst,
	type ExecutableOperationAst,
	type RelationMutationAction,
	type FrameworkPlugin,
	type RequestContext,
	type RuntimeBehaviorStages,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	createPluginEventDispatcher,
	definePluginModule,
	type PluginEventDispatcher,
} from '@ultimabase/plugin-kit'
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
import { normalizeRoleName } from './role-reference.js'
import {
	roleDeletedEventContract,
	roleHierarchyChangedEventContract,
	roleMembershipChangedEventContract,
	optionalRoleEvents,
	type RoleHierarchyChangedEvent,
	type RoleMembershipChangedEvent,
} from './role-events.js'

const rolesPluginModule = definePluginModule({
	core: '^0.0.0',
	pluginId: rolesPluginName,
	version: '0.0.0',
})

const optionalReferenceCleanups = optionalCapability(
	requestSubjectReferenceCleanupCapability,
	'^1.0.0',
	{ phase: 'setup' },
)
const referenceCleanupsBySchemas = new WeakMap<
	object,
	readonly NamedRoleReferenceCleanup[]
>()

const collectRoleReferenceCleanups = (
	contributions: readonly {
		readonly cleanup: Readonly<{ readonly kind: string }>
		readonly name: string
	}[],
): readonly NamedRoleReferenceCleanup[] =>
	immutableArray(
		contributions.flatMap((contribution) =>
			contribution.cleanup.kind === 'role'
				? [contribution as NamedRoleReferenceCleanup]
				: [],
		),
	)
const readRoleSchemas = (
	schemas: CompiledSchemaRegistry,
): readonly SchemaDefinition[] =>
	schemas
		.values()
		.filter((schema) => getRoleSchemaDeclaration(schema) !== undefined)

const roleResolverProvider = provideCapability(requestRoleResolverCapability, {
	contributionId: 'stored-roles',
	create: ({ schemas }) => ({
		value: createStoredRoleResolver(readRoleSchemas(schemas)),
	}),
})

const roleBehaviorProvider: CapabilityProviderDeclaration<
	typeof runtimeBehaviorCapability
> = provideRuntimeBehavior({
	contributionId: 'role-membership-lifecycle',
	create: ({ assertPrivilege, capabilities, owner, schemas }) => {
		const readReferenceCleanups = (): readonly NamedRoleReferenceCleanup[] =>
			referenceCleanupsBySchemas.get(schemas) ?? immutableArray([])

		const roleSchemas = new Set(readRoleSchemas(schemas))
		const events = createPluginEventDispatcher({
			assertPrivilege,
			capabilities,
			owner,
			requirement: optionalRoleEvents,
		})

		return {
			value: createRoleRuntimeBehavior(
				roleSchemas,
				readReferenceCleanups,
				events,
			),
		}
	},
})

/** Exposes the application-local role domains discovered during setup. */
export interface RolesPluginExports {
	readonly schemas: readonly SchemaDefinition[]
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

const readOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const query: unknown = Reflect.get(operation, 'query')
	const schemaNode: unknown = isPlainRecord(query)
		? query.schema
		: Reflect.get(operation, 'schema')
	if (
		!isPlainRecord(schemaNode) ||
		typeof schemaNode.definition !== 'function'
	) {
		throw new TypeError('Role Runtime operation is missing its schema')
	}
	return schemaNode.definition as unknown as SchemaDefinition
}

const normalizeRoleNameValue = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('Role names must be strings')
	}
	return normalizeRoleName(value)
}

const normalizeRoleRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	Object.hasOwn(value, 'name')
		? immutableRecord({ ...value, name: normalizeRoleNameValue(value.name) })
		: value

const normalizeRoleUpdate = (value: unknown): unknown => {
	if (!isPlainRecord(value) || !isUnknownArray(value.operations)) return value

	return immutableRecord({
		...value,
		operations: immutableArray(
			value.operations.map((operation) => {
				if (
					!isPlainRecord(operation) ||
					operation.field !== 'name' ||
					!Object.hasOwn(operation, 'value')
				) {
					return operation
				}
				return immutableRecord({
					...operation,
					value: normalizeRoleNameValue(operation.value),
				})
			}),
		),
	})
}

const normalizeRoleOperation = <const TOperation extends DatabaseOperationAst>(
	operation: TOperation,
): TOperation => {
	const executable = operation as unknown as ExecutableOperationAst
	const normalized: unknown = (() => {
		switch (executable.kind) {
			case 'create-one':
				return immutableRecord({
					...executable,
					input: normalizeRoleRecord(executable.input),
				})
			case 'create-many':
				return immutableRecord({
					...executable,
					inputs: immutableArray(executable.inputs.map(normalizeRoleRecord)),
				})
			case 'update-one':
			case 'update-many':
				return immutableRecord({
					...executable,
					update: normalizeRoleUpdate(executable.update),
				})
			case 'upsert-one':
				return immutableRecord({
					...executable,
					create: normalizeRoleRecord(executable.create),
					update: normalizeRoleUpdate(executable.update),
				})
			case 'upsert-many':
				return immutableRecord({
					...executable,
					items: immutableArray(
						executable.items.map((item) =>
							immutableRecord({
								...item,
								create: normalizeRoleRecord(item.create),
								update: normalizeRoleUpdate(item.update),
							}),
						),
					),
				})
			default:
				return executable
		}
	})()
	return normalized as TOperation
}

/** Queues audit-ready data for delivery only after Runtime confirms the commit. */
const emitRoleRelationChanges = (
	context: RequestContext,
	operation: unknown,
	item: unknown,
	events: PluginEventDispatcher,
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

			events.emit(context, roleMembershipChangedEventContract, payload)
			continue
		}

		const payload: RoleHierarchyChangedEvent = immutableRecord({
			action: change.action,
			childRoleIds: change.targetIds,
			roleId,
		})

		events.emit(context, roleHierarchyChangedEventContract, payload)
	}
}

const createRoleRuntimeBehavior = (
	roleSchemas: ReadonlySet<SchemaDefinition>,
	readReferenceCleanups: () => readonly NamedRoleReferenceCleanup[],
	events: PluginEventDispatcher,
): RuntimeBehaviorStages =>
	immutableRecord({
		transformInput: (input) =>
			roleSchemas.has(readOperationSchema(input.operation))
				? normalizeRoleOperation(input.operation)
				: input.operation,
		observePreparedMutation: async ({ context, operation, target }) => {
			if (
				operation.kind !== 'delete-one' ||
				!roleSchemas.has(readOperationSchema(operation)) ||
				target === null ||
				target === undefined
			) {
				return
			}
			const schema = readOperationSchema(operation)
			const declaration = getRoleSchemaDeclaration(schema)
			if (declaration === undefined) {
				throw new TypeError('Discovered role schema lost its declaration')
			}
			const roleName: unknown = Reflect.get(target, 'name')
			if (typeof roleName !== 'string') {
				throw new TypeError('Prepared role deletion requires a role name')
			}
			const event = await applyRoleDeletionPolicy(
				context,
				schema,
				roleName,
				declaration,
				readReferenceCleanups(),
			)
			events.emit(context, roleDeletedEventContract, event)
		},
		transformResult: async (input) => {
			if (
				input.outcome === undefined ||
				input.operation.kind !== 'update-one' ||
				!roleSchemas.has(readOperationSchema(input.operation))
			) {
				return input.result
			}
			const schema = readOperationSchema(input.operation)
			const changes = readRoleRelationChanges(input.operation)
			for (const materialization of input.outcome.materializations) {
				if (materialization.kind !== 'update') continue

				const item = materializeSchemaModel(schema, materialization.current)
				if (changes.some(({ field }) => field === 'roles')) {
					await assertRoleHierarchyAcyclic(item)
				}
				emitRoleRelationChanges(input.context, input.operation, item, events)
			}
			return input.result
		},
	})

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
			readonly name: 'authority:elevate'
			readonly reason: 'Resolves and maintains persisted role membership through audited internal Master queries.'
		}>,
		Readonly<{
			readonly name: 'runtime:intercept'
			readonly reason: 'Maintains role invariants through generic Runtime behavior.'
		}>,
		Readonly<{
			readonly name: 'event:publish'
			readonly reason: 'Publishes committed role membership and hierarchy changes.'
		}>,
	],
	undefined,
	Readonly<{
		readonly provides: readonly [
			CapabilityProviderDeclaration<typeof requestRoleResolverCapability>,
			CapabilityProviderDeclaration<typeof runtimeBehaviorCapability>,
		]
		readonly optional: readonly [
			CapabilityRequirement<
				typeof requestSubjectReferenceCleanupCapability,
				true,
				'^1.0.0',
				'setup'
			>,
			CapabilityRequirement<
				typeof optionalRoleEvents.token,
				true,
				'^1.0.0',
				'materialization'
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
	rolesPluginModule.plugin({
		privileges: [
			{
				name: 'authority:elevate',
				reason:
					'Resolves and maintains persisted role membership through audited internal Master queries.',
			},
			{
				name: 'runtime:intercept',
				reason: 'Maintains role invariants through generic Runtime behavior.',
			},
			{
				name: 'event:publish',
				reason: 'Publishes committed role membership and hierarchy changes.',
			},
		],
		capabilities: {
			optional: [optionalReferenceCleanups, optionalRoleEvents],
			provides: [roleResolverProvider, roleBehaviorProvider],
		},
		setup: ({ capabilities, schemas }) => {
			referenceCleanupsBySchemas.set(
				schemas,
				collectRoleReferenceCleanups(
					capabilities.get(optionalReferenceCleanups) ?? [],
				),
			)
			const roleSchemas = readRoleSchemas(schemas)
			return Object.freeze({ schemas: Object.freeze(roleSchemas) })
		},
	})
