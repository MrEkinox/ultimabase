import {
	Pointer,
	contributeApplication,
	contributeDeclarations,
	getOperationSchema,
	requestSubjectReferenceCleanupCapability,
	requestRoleResolverCapability,
	materializeSchemaModel,
	optionalCapability,
	plugin,
	provideCapability,
	provideRuntimeBehavior,
	withPluginPrivileges,
	type runtimeBehaviorCapability,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type CompiledSchemaRegistry,
	type NamedRequestSubjectReferenceCleanup,
	type PluginInstance,
	type RelationMutationAction,
	type RuntimeBehaviorStages,
	type SchemaDefinition,
} from '@ultimabase/core'
import { createPluginEventDispatcher } from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	getRoleSchemaDeclaration,
	rolesPluginId,
	type RoleSchemaDeclaration,
} from './role-schema.js'
import {
	roleSchemaIdentityOption,
	roleSchemaIdentityOptionName,
} from './role-schema-identity.js'
import {
	assertRoleHierarchyAcyclic,
	readPersistedRoleId,
} from './role-hierarchy.js'
import { applyRoleDeletionPolicy } from './role-deletion.js'
import { createStoredRoleResolver } from './role-access.js'
import { normalizeRoleOperation } from './role-reference.js'
import {
	roleDeletedEventContract,
	roleHierarchyChangedEventContract,
	roleMembershipChangedEventContract,
	optionalRoleEvents,
} from './role-events.js'

const optionalReferenceCleanups: CapabilityRequirement<
	typeof requestSubjectReferenceCleanupCapability,
	true,
	'^1.0.0',
	'setup'
> = optionalCapability(requestSubjectReferenceCleanupCapability, '^1.0.0', {
	phase: 'setup',
})
/** Role-kind cleanup contributions, bound to each application during setup. */
const referenceCleanupsBySchemas = new WeakMap<
	object,
	readonly NamedRequestSubjectReferenceCleanup[]
>()

/** Pairs one discovered role schema with its package-private declaration. */
interface RoleDomain {
	readonly declaration: RoleSchemaDeclaration
	readonly schema: SchemaDefinition
}

/** Discovers role schemas only through the identity recorded by `RoleSchema.define()`. */
const readRoleDomains = (
	schemas: CompiledSchemaRegistry,
): readonly RoleDomain[] =>
	schemas.values().flatMap((schema) => {
		const declaration = getRoleSchemaDeclaration(schema)

		return declaration === undefined ? [] : [{ declaration, schema }]
	})

const roleResolverProvider: CapabilityProviderDeclaration<
	typeof requestRoleResolverCapability
> = provideCapability(requestRoleResolverCapability, {
	contributionId: 'stored-roles',
	create: ({ schemas }) => ({
		value: createStoredRoleResolver(
			readRoleDomains(schemas).map(({ schema }) => schema),
		),
	}),
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

	for (const update of operation.update.operations) {
		if (
			!isPlainRecord(update) ||
			update.kind !== 'relation' ||
			(update.field !== 'members' && update.field !== 'roles') ||
			!isPlainRecord(update.value) ||
			!isUnknownArray(update.value.targets)
		) {
			continue
		}

		const { action, targets } = update.value

		if (
			action !== 'clear' &&
			action !== 'connect' &&
			action !== 'disconnect' &&
			action !== 'set'
		) {
			continue
		}

		changes.push(
			immutableRecord({
				action,
				field: update.field,
				targetIds: immutableArray(
					targets.flatMap((target) => (Pointer.is(target) ? [target.id] : [])),
				),
			}),
		)
	}

	return immutableArray(changes)
}

type RoleNestedWrite = Parameters<
	NonNullable<RuntimeBehaviorStages['transformResult']>
>[0]['nestedWrite']

/**
 * Reads the member and included-role links a nested write applied to this
 * role (ADR-0308), so they get the same invariants and events as handles.
 */
const readNestedRoleRelationChanges = (
	nestedWrite: RoleNestedWrite,
): readonly RoleRelationChange[] =>
	immutableArray(
		(nestedWrite?.node.relationships ?? []).flatMap(
			(relationship): RoleRelationChange[] => {
				const field = relationship.fieldName
				if (
					relationship.kind !== 'relation' ||
					(field !== 'members' && field !== 'roles') ||
					relationship.command === 'update'
				) {
					return []
				}
				const created = relationship.command === 'create'
				return [
					immutableRecord({
						action: created ? 'connect' : relationship.command,
						field,
						targetIds: created
							? immutableArray(
									relationship.children.flatMap(({ reservedId }) =>
										reservedId === undefined ? [] : [reservedId],
									),
								)
							: relationship.ids,
					}),
				]
			},
		),
	)

const roleBehaviorProvider: CapabilityProviderDeclaration<
	typeof runtimeBehaviorCapability
> = provideRuntimeBehavior({
	contributionId: 'role-membership-lifecycle',
	create: ({ assertPrivilege, capabilities, owner, schemas }) => {
		const roles = new Map<unknown, RoleDomain>(
			readRoleDomains(schemas).map((domain) => [domain.schema, domain]),
		)
		const events = createPluginEventDispatcher({
			assertPrivilege,
			capabilities,
			owner,
			requirement: optionalRoleEvents,
		})
		const value: RuntimeBehaviorStages = immutableRecord({
			transformInput: (input) =>
				roles.has(getOperationSchema(input.operation))
					? normalizeRoleOperation(input.operation)
					: input.operation,
			observePreparedMutation: async ({ context, operation, target }) => {
				const role =
					operation.kind === 'delete-one'
						? roles.get(getOperationSchema(operation))
						: undefined

				if (role === undefined || target === null || target === undefined) {
					return
				}
				const roleName: unknown = Reflect.get(target, 'name')
				if (typeof roleName !== 'string') {
					throw new TypeError('Prepared role deletion requires a role name')
				}
				const event = await applyRoleDeletionPolicy(
					context,
					role.schema,
					roleName,
					role.declaration,
					referenceCleanupsBySchemas.get(schemas) ?? immutableArray([]),
				)
				// Optional delivery happens only after the transaction commits.
				events.emit(context, roleDeletedEventContract, event)
			},
			transformResult: async ({
				context,
				nestedWrite,
				operation,
				outcome,
				result,
			}) => {
				if (
					outcome === undefined ||
					(operation.kind !== 'update-one' && operation.kind !== 'create-one')
				) {
					return result
				}
				const role = roles.get(getOperationSchema(operation))
				if (role === undefined) return result

				const changes = [
					...readRoleRelationChanges(operation),
					...readNestedRoleRelationChanges(nestedWrite),
				]
				const hierarchyChanged = changes.some(({ field }) => field === 'roles')

				for (const materialization of outcome.materializations) {
					if (
						materialization.kind !== 'update' &&
						materialization.kind !== 'create'
					) {
						continue
					}

					const item = materializeSchemaModel(
						role.schema,
						materialization.current,
					)
					if (hierarchyChanged) await assertRoleHierarchyAcyclic(item)
					if (changes.length === 0) continue

					// Audit-ready payloads are queued for post-commit delivery only.
					const roleId = readPersistedRoleId(item)
					for (const { action, field, targetIds } of changes) {
						if (field === 'members') {
							events.emit(
								context,
								roleMembershipChangedEventContract,
								immutableRecord({ action, memberIds: targetIds, roleId }),
							)
						} else {
							events.emit(
								context,
								roleHierarchyChangedEventContract,
								immutableRecord({ action, childRoleIds: targetIds, roleId }),
							)
						}
					}
				}
				return result
			},
		})

		return { value }
	},
})

const rolesPluginPermissions = {
	'authority:elevate':
		'Resolves and maintains persisted role membership through audited internal Master queries.',
} as const

/** Represents the exact option-light official stored-role provider. */
export type RolesPlugin = PluginInstance<{
	readonly id: typeof rolesPluginId
	readonly exports: ReturnType<() => void>
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
}>

/**
 * Discovers every registered `RoleSchema` through exact package-owned identity.
 *
 * Schema fields, hooks, Access, indexes, and transports stay in their native
 * declarations rather than becoming plugin options.
 */
export const rolesPlugin = (): RolesPlugin => {
	const declarations = contributeDeclarations({
		schema: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'role-schema-identity',
				schema: {
					[roleSchemaIdentityOptionName]: roleSchemaIdentityOption,
				},
			})
			return undefined
		},
	})
	const application = contributeApplication(({ capabilities, schemas }) => {
		// Setup binds reference cleanup contributions to this exact application.
		referenceCleanupsBySchemas.set(
			schemas,
			immutableArray(
				(capabilities.get(optionalReferenceCleanups) ?? []).filter(
					({ cleanup }) => cleanup.kind === 'role',
				),
			),
		)
		return { exports: undefined }
	})
	const behavior = withPluginPrivileges(roleBehaviorProvider, [
		'authority:elevate',
		'event:publish',
	])
	return plugin({
		id: rolesPluginId,
		version: '0.0.0',
		core: '^0.0.0',
		permissions: rolesPluginPermissions,
		contributions: [
			optionalReferenceCleanups,
			optionalRoleEvents,
			roleResolverProvider,
			behavior,
			declarations,
			application,
		],
	})
}
