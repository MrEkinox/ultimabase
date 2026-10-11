import {
	Pointer,
	getOperationSchema,
	requestSubjectReferenceCleanupCapability,
	requestRoleResolverCapability,
	materializeSchemaModel,
	provideRuntimeBehavior,
	type runtimeBehaviorCapability,
	type CompiledSchemaRegistry,
	type Logger,
	type NamedRequestSubjectReferenceCleanup,
	type RelationMutationAction,
	type RuntimeBehaviorStages,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	contributeApplication,
	contributeDeclarations,
	optionalCapability,
	plugin,
	provideCapability,
	provideSchemaFactories,
	withPluginPrivileges,
	type CapabilityProviderDeclaration,
	type CapabilityRequirement,
	type PluginInstance,
	type PluginSchemaFactoriesSource,
	type PluginSchemaStaticsSource,
} from '@ultimabase/core/plugin'
import { createPluginEventDispatcher } from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	createRoleSchemaFactory,
	getRoleSchemaDeclaration,
	rolesPluginId,
	type RoleSchemaDeclaration,
	type RoleSchemaFactories,
	type RoleSchemaStaticsSlot,
} from './role-schema.js'
import { ensureRoles } from './role-ensure.js'
import { createRoleQueries, type RolesPluginExports } from './role-queries.js'
import {
	roleSchemaIdentityOption,
	roleSchemaIdentityOptionName,
} from './role-schema-identity.js'
import {
	assertRoleHierarchyAcyclic,
	readPersistedRoleId,
} from './role-hierarchy.js'
import { applyRoleDeletionPolicy } from './role-deletion.js'
import {
	createStoredRoleResolver,
	type StoredRoleResolver,
} from './role-access.js'
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

/** Discovers role schemas only through the identity recorded by `App.RoleSchema.define()`. */
const readRoleDomains = (
	schemas: CompiledSchemaRegistry,
): readonly RoleDomain[] =>
	schemas.values().flatMap((schema) => {
		const declaration = getRoleSchemaDeclaration(schema)

		return declaration === undefined ? [] : [{ declaration, schema }]
	})

/** One application's resolver and its query exports, shared by setup and `start()`. */
interface RoleApplicationState {
	readonly queries: RolesPluginExports
	readonly resolver: StoredRoleResolver
}

const roleStatesBySchemas = new WeakMap<object, RoleApplicationState>()

const readRoleState = (schemas: object): RoleApplicationState => {
	const state = roleStatesBySchemas.get(schemas)
	if (state === undefined) {
		throw new TypeError('Roles plugin is not initialized for this application')
	}
	return state
}

const roleResolverProvider: CapabilityProviderDeclaration<
	typeof requestRoleResolverCapability
> = provideCapability(requestRoleResolverCapability, {
	contributionId: 'stored-roles',
	create: ({ callbacks, owner, schemas }) => {
		const roleSchemas = readRoleDomains(schemas).map(({ schema }) => schema)
		const resolver = createStoredRoleResolver(roleSchemas)
		roleStatesBySchemas.set(
			schemas,
			immutableRecord({
				resolver,
				// Exports run application code paths; their Master reads stay attributed to Roles.
				queries: createRoleQueries(
					() => resolver,
					new Set(roleSchemas),
					(work) => callbacks.runPlugin(owner, work),
				),
			}),
		)
		const { hasRole, resolveCurrentRoles, resolvePersistentRole } = resolver
		return {
			value: immutableRecord({
				hasRole,
				resolveCurrentRoles,
				resolvePersistentRole,
			}),
		}
	},
})

interface RoleRelationChange {
	readonly action: RelationMutationAction
	readonly field: 'includedRoles' | 'members'
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
			(update.field !== 'members' && update.field !== 'includedRoles') ||
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
					(field !== 'members' && field !== 'includedRoles') ||
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
				const hierarchyChanged = changes.some(({ field }) => field === 'includedRoles')

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
					if (hierarchyChanged)
						await assertRoleHierarchyAcyclic(role.schema, item)
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

type RolesSource =
	| PluginSchemaFactoriesSource<RoleSchemaFactories>
	| PluginSchemaStaticsSource<RoleSchemaStaticsSlot>

/** Represents the exact option-light official stored-role provider. */
export type RolesPlugin = PluginInstance<{
	readonly id: typeof rolesPluginId
	readonly exports: RolesPluginExports
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: RolesSource
}>

/** The `rolesPlugin` factory; `ultimabase.plugin(rolesPlugin)` reads its exports. */
export interface RolesPluginFactory {
	/**
	 * Installs Roles: adds `App.RoleSchema`, resolves role membership for
	 * `hasRole` and other policies, and creates `ensure` roles at `start()`.
	 * @example `const App = UltimaBase.use(accessPlugin(), rolesPlugin())`
	 */
	(): RolesPlugin
	readonly pluginId: typeof rolesPluginId
}

const ensureAllRoles = async (
	schemas: CompiledSchemaRegistry,
	logger: Logger,
): Promise<void> => {
	for (const { declaration, schema } of readRoleDomains(schemas)) {
		if (declaration.ensure.length === 0) continue
		let created: readonly string[]
		try {
			created = await ensureRoles(schema, declaration.ensure)
		} catch (error: unknown) {
			// Creating roles is a Master write: name the declaration that needs it.
			throw new TypeError(
				`Roles could not create the ensure roles of ${schema.className} (they are created with the application's masterAuthority)`,
				{ cause: error },
			)
		}
		if (created.length > 0) {
			logger.info(`created ${schema.className} roles: ${created.join(', ')}`)
		}
	}
}

/**
 * Discovers every registered role schema through exact package-owned identity.
 *
 * Schema fields, hooks, Access, indexes, and transports stay in their native
 * declarations rather than becoming plugin options.
 */
const createRolesPlugin = (): RolesPlugin => {
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
		return {
			exports: immutableRecord({
				has: (...arguments_: Parameters<RolesPluginExports['has']>) =>
					readRoleState(schemas).queries.has(...arguments_),
				current: (schema: SchemaDefinition) =>
					readRoleState(schemas).queries.current(schema),
			}),
			ready: ({ logger }) => ensureAllRoles(schemas, logger),
		}
	})
	const behavior = withPluginPrivileges(roleBehaviorProvider, [
		'authority:elevate',
		'event:publish',
	])
	const instance: RolesPlugin = plugin({
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
	return provideSchemaFactories<RolesPlugin, RolesSource>(instance, {
		RoleSchema: createRoleSchemaFactory,
	})
}

/**
 * Installs Roles (ADR-0322). Role schemas are declared with
 * `App.RoleSchema.define(...)`; `ultimabase.plugin(rolesPlugin)` returns
 * `has` and `current`.
 *
 * @example
 * ```ts
 * const App = UltimaBase.use(accessPlugin(), rolesPlugin())
 * export const TodoRole = App.RoleSchema.define({ className: 'TodoRole', members: () => TodoUser }).with({})
 * ```
 */
export const rolesPlugin: RolesPluginFactory = Object.assign(
	createRolesPlugin,
	{ pluginId: rolesPluginId },
)
