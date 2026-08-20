import {
	AccessSubjectReference,
	accessReferenceCleanupCapability,
	accessPrincipalResolverCapability,
	accessRoleResolverCapability,
	applyUpdateExpressionToRecord,
	constraint,
	defineFieldKindAccessTarget,
	FrameworkError,
	guard,
	optionalCapability,
	preparedOperation,
	provideCapability,
	provideRuntimeBehavior,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	type DatabaseOperationAst,
	type CompiledSchemaRegistry,
	type AccessContext,
	type ExecutableOperationAst,
	type PointerValue,
	type PluginCapabilityReader,
	type RuntimeOperationStageInput,
	type RuntimeOperationTransformStage,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	createPluginEventDispatcher,
	definePluginModule,
	definePluginOptionsParser,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	aclChangedEventContract,
	optionalACLChangedEvents,
} from './acl-events.js'
import {
	createACLApplicationState,
	type PersistentRoleResolver,
} from './application-state.js'
import {
	createACLReferenceCleanups,
	createACLReferenceConstraint,
	getACLReferenceScope,
	removeACLReference,
	type ACLReferenceSubject,
} from './acl-reference-cleanup.js'
import { normalizeACLPermissions, type ACLPermission } from './acl-contracts.js'
import {
	assertACLEntryLimits,
	defaultACLEntryLimits,
	normalizeACLEntryLimits,
	resolveACLEntryLimits,
	type ACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import { createACLRowConstraint, requiredACLPermissions } from './acl-access.js'
import type { ACLPlugin, ACLPluginOptions } from './plugin-contracts.js'
import { readACLMutationItems } from './mutation-items.js'
import {
	aclFieldName,
	aclFieldKind,
	aclPluginName,
	aclSchemaExtensionName,
	type ACLNormalizedUpdateInput,
	type ACLNormalizedUpdateOperation,
	type ACLSchemaExtensionConfig,
	type ACLField,
} from './acl-extension.js'

const aclPluginModule = definePluginModule({
	core: '^0.0.0',
	pluginId: aclPluginName,
	version: '0.0.0',
})

const optionalPrincipalResolver = optionalCapability(
	accessPrincipalResolverCapability,
	'^1.0.0',
)
const optionalRoleResolver = optionalCapability(
	accessRoleResolverCapability,
	'^1.0.0',
)

const readProtectedSchemas = (
	schemas: CompiledSchemaRegistry,
): readonly SchemaDefinition[] =>
	schemas
		.values()
		.filter((schema) =>
			schema.extensions.some(
				(extension) => extension.name === aclSchemaExtensionName,
			),
		)

const principalReferenceCleanupProvider = provideCapability(
	accessReferenceCleanupCapability,
	{
		contributionId: 'principal-references',
		create: ({ schemas }) => ({
			value: immutableRecord({
				cleanup: createACLReferenceCleanups(readProtectedSchemas(schemas))
					.principal,
				name: 'acl-principal-reference-cleanup',
			}),
		}),
	},
)

const roleReferenceCleanupProvider = provideCapability(
	accessReferenceCleanupCapability,
	{
		contributionId: 'role-references',
		create: ({ schemas }) => ({
			value: immutableRecord({
				cleanup: createACLReferenceCleanups(readProtectedSchemas(schemas)).role,
				name: 'acl-role-reference-cleanup',
			}),
		}),
	},
)

type ACLCreateOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

interface ACLPreparedUpdateOperation {
	readonly kind: 'update-one'
	readonly query: Readonly<{
		readonly schema: Readonly<{ readonly definition: SchemaDefinition }>
	}>
	readonly update: unknown
}

const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

const normalizeACLPluginOptions = definePluginOptionsParser({
	formatUnknownKey: (key) => `Unknown aclPlugin option: ${String(key)}`,
	keys: ['limits'] as const,
	name: 'aclPlugin options',
	normalize: (options): ACLPluginOptions => {
		const limits = normalizeACLEntryLimits(
			options.limits as ACLEntryLimits | undefined,
			'aclPlugin limits',
		)

		return limits === undefined ? {} : { limits }
	},
})

/** Keeps ACL-document management behind trusted server authority. */
const assertMasterACLManagement = (context: AccessContext): void => {
	if (context.access.mode === 'master') return

	throw new FrameworkError(
		'PERMISSION_DENIED',
		'Only trusted master execution may supply or replace an ACL value.',
		{
			publicMessage: 'The operation is not permitted.',
			internalDetails: { kind: 'acl-management-requires-master' },
		},
	)
}

/** Projects only developer fields so create and update callbacks share one data shape. */
const projectACLData = (
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
	const extensionFieldNames = new Set(
		schema.extensions.flatMap(({ fields }) => Object.keys(fields)),
	)

	return immutableRecord(
		Object.fromEntries(
			Object.entries(input).filter(([fieldName]) => {
				if (extensionFieldNames.has(fieldName)) return false

				const field = schema.fields[fieldName]

				return (
					field !== undefined &&
					!('system' in field.options && field.options.system === true)
				)
			}),
		),
	)
}

const resolveDefaultACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	config: ACLSchemaExtensionConfig<TData>,
	data: TData,
	principal: PointerValue | undefined,
	context: AccessContext,
): Promise<ACL> => {
	const declaredDefault = config.default
	const value =
		typeof declaredDefault === 'function'
			? await declaredDefault({ context, data, principal })
			: declaredDefault

	return snapshotResolvedACL(value, 'acl default')
}

/** Prevents role-bearing values from being accepted without membership resolution. */
const assertACLRoleResolution = (
	value: ACL,
	roleResolutionAvailable: boolean,
): void => {
	if (roleResolutionAvailable || value.toJSON().roles.length === 0) return

	throw new TypeError(
		'ACL role grants require a role resolver with current-role enumeration',
	)
}

/** Replaces every logical role selector with its stable provider-owned identity. */
const resolvePersistentACLRoles = async (
	value: ACL,
	context: AccessContext,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<ACL> => {
	const document = value.toJSON()

	if (document.roles.length === 0) return value

	if (resolvePersistentRole === undefined) {
		throw new TypeError(
			'ACL role grants require a role resolver with persistent-role resolution',
		)
	}

	const resolvedEntries = await Promise.all(
		document.roles.map(async (entry) => {
			const resolved = await resolvePersistentRole({
				context,
				role: new AccessSubjectReference('role', entry.value),
			})

			if (!(resolved instanceof AccessSubjectReference)) {
				throw new TypeError(`ACL role could not be resolved: ${entry.value}`)
			}

			return immutableRecord({
				permissions: entry.permissions,
				value: resolved.value,
			})
		}),
	)
	const permissionsByRole = new Map<string, readonly ACLPermission[]>()

	for (const entry of resolvedEntries) {
		permissionsByRole.set(
			entry.value,
			normalizeACLPermissions([
				...(permissionsByRole.get(entry.value) ?? []),
				...entry.permissions,
			]),
		)
	}

	return ACL.fromJSON({
		...document,
		roles: [...permissionsByRole.entries()].map(([role, permissions]) => ({
			kind: 'role' as const,
			permissions,
			value: role,
		})),
	})
}

/** Applies every adapter-neutral invariant to one accepted ACL value. */
const validateAcceptedACL = async (
	value: ACL,
	roleResolutionAvailable: boolean,
	limits: ResolvedACLEntryLimits,
	context: AccessContext,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<ACL> => {
	assertACLRoleResolution(value, roleResolutionAvailable)
	const persistent = await resolvePersistentACLRoles(
		value,
		context,
		resolvePersistentRole,
	)
	assertACLEntryLimits(persistent, limits)

	return persistent
}

/** Detects declarations that cannot become valid without role capabilities. */
const hasStaticRoleGrant = (config: ACLSchemaExtensionConfig): boolean =>
	config.default instanceof ACL && config.default.toJSON().roles.length > 0

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
	config: ACLSchemaExtensionConfig<TData>,
	principal: PointerValue | undefined,
	context: AccessContext,
	roleResolutionAvailable: boolean,
	limits: ResolvedACLEntryLimits,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<Readonly<Record<string, unknown>>> => {
	// The schema-targeted hook guarantees this extension's declared developer-data shape.
	const data = projectACLData(schema, input) as TData
	const explicitACL = Object.hasOwn(input, aclFieldName)
		? snapshotResolvedACL(input[aclFieldName], 'acl input')
		: undefined

	if (explicitACL !== undefined) assertMasterACLManagement(context)

	if (explicitACL !== undefined && config.resolveInput === undefined) {
		throw new TypeError(
			'Explicit ACL input requires acl({ resolveInput }) configuration',
		)
	}

	const resolvedInput = await config.resolveInput?.({
		context,
		currentAcl: undefined,
		currentData: undefined,
		data,
		inputAcl: explicitACL,
		operation: 'create',
		principal,
		update: undefined,
	})
	const acceptedACL =
		resolvedInput === undefined
			? await resolveDefaultACL(config, data, principal, context)
			: snapshotResolvedACL(resolvedInput, 'acl resolveInput')
	const resolvedACL = await validateAcceptedACL(
		acceptedACL,
		roleResolutionAvailable,
		limits,
		context,
		resolvePersistentRole,
	)

	return immutableRecord({ ...input, [aclFieldName]: resolvedACL })
}

/** Applies one schema extension to every create candidate without merging bulk items. */
/** @internal Applies ACL create semantics before Runtime structural revalidation. */
export const resolveCreateOperationACL = async <
	const TOperation extends ACLCreateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	config: ACLSchemaExtensionConfig<TData>,
	principal: PointerValue | undefined,
	context: AccessContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolveCreateInputACL(
					operation.schema.definition,
					operation.input,
					config,
					principal,
					context,
					roleResolutionAvailable,
					limits,
					resolvePersistentRole,
				),
			})
		case 'create-many':
			return immutableRecord({
				...operation,
				inputs: immutableArray(
					await Promise.all(
						operation.inputs.map((input) =>
							resolveCreateInputACL(
								operation.schema.definition,
								input,
								config,
								principal,
								context,
								roleResolutionAvailable,
								limits,
								resolvePersistentRole,
							),
						),
					),
				),
			})
		case 'upsert-one':
			return immutableRecord({
				...operation,
				create: await resolveCreateInputACL(
					operation.query.schema.definition,
					operation.create,
					config,
					principal,
					context,
					roleResolutionAvailable,
					limits,
					resolvePersistentRole,
				),
			})
		case 'upsert-many':
			return immutableRecord({
				...operation,
				items: immutableArray(
					await Promise.all(
						operation.items.map(async (item) =>
							immutableRecord({
								...item,
								create: await resolveCreateInputACL(
									operation.schema.definition,
									item.create,
									config,
									principal,
									context,
									roleResolutionAvailable,
									limits,
									resolvePersistentRole,
								),
							}),
						),
					),
				),
			})
	}
}

/** Resolves the only supported row-aware ACL replacement after Access approval. */
export const resolvePreparedOperationACL = async <
	const TOperation extends ACLPreparedUpdateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	target: Readonly<Record<string, unknown>>,
	config: ACLSchemaExtensionConfig<TData>,
	principal: PointerValue | undefined,
	context: AccessContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
	referenceCleanup?: ACLReferenceSubject,
): Promise<TOperation> => {
	const update: unknown = operation.update

	if (
		!isPlainRecord(update) ||
		update.kind !== 'update-expression' ||
		!isUnknownArray(update.operations)
	) {
		throw new TypeError('ACL update requires a normalized update expression')
	}
	const normalizedUpdate = immutableRecord({
		kind: 'update-expression' as const,
		operations: update.operations,
	})

	const aclOperation = update.operations.find(
		(candidate) => isPlainRecord(candidate) && candidate.field === aclFieldName,
	)

	if (aclOperation === undefined) return operation

	assertMasterACLManagement(context)

	if (referenceCleanup !== undefined) {
		const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')
		const resolvedAcl = removeACLReference(currentAcl, referenceCleanup)
		const operations = immutableArray(
			update.operations.map((candidate) =>
				candidate === aclOperation
					? immutableRecord({ ...aclOperation, value: resolvedAcl })
					: candidate,
			),
		)

		return immutableRecord({
			...operation,
			update: immutableRecord({ ...update, operations }),
		})
	}

	if (
		!isPlainRecord(aclOperation) ||
		aclOperation.kind !== 'set' ||
		!Object.hasOwn(aclOperation, 'value')
	) {
		throw new TypeError('ACL update must replace the complete ACL value')
	}

	if (config.resolveInput === undefined) {
		throw new TypeError(
			'Explicit ACL input requires acl({ resolveInput }) configuration',
		)
	}

	const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')
	const inputAcl = snapshotResolvedACL(aclOperation.value, 'acl input')
	const schema = operation.query.schema.definition
	const currentData = projectACLData(schema, target) as TData
	// Structural revalidation has normalized every operation before this locked callback.
	const data = projectACLData(
		schema,
		applyUpdateExpressionToRecord(schema, target, normalizedUpdate),
	) as TData
	const updateInput = snapshotACLUpdateInput(normalizedUpdate)
	const resolved = await config.resolveInput({
		context,
		currentAcl,
		currentData,
		data,
		inputAcl,
		operation: 'update',
		principal,
		update: updateInput,
	})
	const acceptedAcl =
		resolved === undefined
			? currentAcl
			: snapshotResolvedACL(resolved, 'acl resolveInput')
	const resolvedAcl = await validateAcceptedACL(
		acceptedAcl,
		roleResolutionAvailable,
		limits,
		context,
		resolvePersistentRole,
	)
	const operations = immutableArray(
		update.operations.map((candidate) =>
			candidate === aclOperation
				? immutableRecord({ ...aclOperation, value: resolvedAcl })
				: candidate,
		),
	)

	return immutableRecord({
		...operation,
		update: immutableRecord({ ...update, operations }),
	})
}

const aclFieldAccessTarget = defineFieldKindAccessTarget<ACLField>(aclFieldKind)

const aclConstraintOperationKinds = Object.freeze([
	'count',
	'delete-many',
	'delete-one',
	'exists',
	'find-many',
	'find-one',
	'get',
	'update-many',
	'update-one',
	'upsert-many',
	'upsert-one',
] as const)

const aclReplacementInvariantOperationKinds = Object.freeze([
	'update-many',
	'upsert-many',
	'upsert-one',
] as const)

const updateTouchesACL = (update: unknown): boolean =>
	isPlainRecord(update) &&
	isUnknownArray(update.operations) &&
	update.operations.some(
		(candidate) => isPlainRecord(candidate) && candidate.field === aclFieldName,
	)

/** Detaches the normalized non-ACL update intent exposed to schema callbacks. */
const snapshotACLUpdateInput = (
	update: Readonly<Record<string, unknown>>,
): ACLNormalizedUpdateInput => {
	if (!isUnknownArray(update.operations)) {
		throw new TypeError('ACL update requires normalized operations')
	}

	const operations: ACLNormalizedUpdateOperation[] = []

	for (const candidate of update.operations) {
		if (
			!isPlainRecord(candidate) ||
			typeof candidate.field !== 'string' ||
			typeof candidate.kind !== 'string'
		) {
			throw new TypeError('ACL update contains an invalid operation')
		}

		if (candidate.field === aclFieldName) continue

		if (
			(candidate.kind !== 'decrement' &&
				candidate.kind !== 'increment' &&
				candidate.kind !== 'set') ||
			!Object.hasOwn(candidate, 'value')
		) {
			throw new TypeError('ACL update contains an unsupported operation')
		}

		operations.push(
			immutableRecord({
				field: candidate.field,
				kind: candidate.kind,
				value: candidate.value,
			}),
		)
	}

	return immutableRecord({
		kind: 'update-expression',
		operations: immutableArray(operations),
	})
}

/** @internal Rejects ACL replacement without one certain itemized update target. */
export const assertSingularACLReplacement = <TSchema extends SchemaDefinition>(
	operation: ExecutableOperationAst<TSchema>,
): void => {
	const unsupported =
		operation.kind === 'update-many'
			? updateTouchesACL(operation.update)
			: operation.kind === 'upsert-one'
				? updateTouchesACL(operation.update)
				: operation.kind === 'upsert-many'
					? operation.items.some(({ update }) => updateTouchesACL(update))
					: false

	if (!unsupported) return

	throw new FrameworkError(
		'VALIDATION_ERROR',
		'ACL replacement requires an itemized singular update.',
		{
			publicMessage:
				'ACL values can only be replaced with updateOne() or itemized updateMany().',
		},
	)
}

const readOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const query: unknown = Reflect.get(operation, 'query')
	const schemaNode: unknown = isPlainRecord(query)
		? query.schema
		: Reflect.get(operation, 'schema')
	if (!isPlainRecord(schemaNode)) {
		throw new TypeError('Runtime operation is missing its schema node')
	}
	const definition: unknown = schemaNode.definition
	if (typeof definition !== 'function') {
		throw new TypeError('Runtime operation schema node is invalid')
	}
	return definition as unknown as SchemaDefinition
}

/**
 * Activates ACL defaults and native Access behavior for schemas using `acl()`.
 *
 * The plugin discovers compatible identity providers through neutral Core
 * services; applications without authentication remain valid. Entry limits
 * default to 100 exact principals and 50 roles per persisted ACL.
 *
 * @example
 * ```ts
 * aclPlugin({ limits: { maxPrincipals: 100, maxRoles: 50 } })
 * ```
 */
export const aclPlugin = (options: ACLPluginOptions = {}): ACLPlugin => {
	const normalizedOptions = normalizeACLPluginOptions(options)
	const pluginLimits = resolveACLEntryLimits(
		defaultACLEntryLimits,
		normalizedOptions.limits,
	)
	const applicationStates = new WeakMap<
		object,
		ReturnType<typeof createACLApplicationState>
	>()
	const readApplicationState = (
		schemas: CompiledSchemaRegistry,
		capabilities: PluginCapabilityReader,
	): ReturnType<typeof createACLApplicationState> => {
		const existing = applicationStates.get(schemas)
		if (existing !== undefined) return existing

		const state = createACLApplicationState({
			hasStaticRoleGrant,
			pluginLimits,
			principalResolver: capabilities.get(optionalPrincipalResolver),
			protectedSchemas: readProtectedSchemas(schemas),
			readMutationItems: readACLMutationItems,
			roleResolver: capabilities.get(optionalRoleResolver),
			schemas,
			snapshotACL: snapshotResolvedACL,
		})
		applicationStates.set(schemas, state)
		return state
	}
	const replacementShapeProvider = provideRuntimeConstraint({
		contributionId: 'acl-replacement-shape',
		create: ({ capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities)
			return {
				value: guard({
					handler: ({ operation }) => {
						if (!state.protectedSchemaSet.has(readOperationSchema(operation))) {
							return
						}

						// Mutation shape is a data invariant, so trusted master execution must enforce it too.
						assertSingularACLReplacement(operation)
					},
					operations: aclReplacementInvariantOperationKinds,
				}),
			}
		},
	})
	const inputProvider = provideRuntimeInterceptor({
		contributionId: 'acl-input',
		create: ({ capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities)
			return {
				value: preparedOperation({
					handler: async ({ context, operation, target }) => {
						const schema = readOperationSchema(operation)
						if (!state.protectedSchemaSet.has(schema)) return { operation }

						const extension = schema.extensions.find(
							(candidate) => candidate.name === aclSchemaExtensionName,
						)
						if (extension === undefined) {
							throw new TypeError(
								'ACL plugin lost its discovered schema extension',
							)
						}
						const schemaConfig = extension.config as ACLSchemaExtensionConfig
						const subjects = await state.resolveSubjects()

						return {
							operation: await resolvePreparedOperationACL(
								operation,
								target,
								schemaConfig,
								subjects.principal,
								context,
								subjects.roleResolutionAvailable,
								state.resolveSchemaLimits(schemaConfig),
								state.readPersistentRoleResolver(),
								getACLReferenceScope(schema),
							),
						}
					},
				}),
			}
		},
	})
	const referenceRowsProvider = provideRuntimeConstraint({
		contributionId: 'acl-reference-rows',
		create: ({ capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities)
			return {
				value: constraint({
					handler: ({ operation }) => {
						const schema = readOperationSchema(operation)
						if (!state.protectedSchemaSet.has(schema)) return immutableArray([])

						const referenceSubject = getACLReferenceScope(schema)
						return referenceSubject === undefined
							? immutableArray([])
							: createACLReferenceConstraint(referenceSubject)
					},
					operations: aclConstraintOperationKinds,
				}),
			}
		},
	})
	const rowsProvider = provideRuntimeConstraint({
		contributionId: 'acl-rows',
		create: ({ capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities)
			return {
				value: constraint({
					handler: async ({ operation }) => {
						const schema = readOperationSchema(operation)
						if (
							!state.protectedSchemaSet.has(schema) ||
							getACLReferenceScope(schema) !== undefined
						) {
							return immutableArray([])
						}

						const subjects = await state.resolveSubjects()
						return requiredACLPermissions(operation).map((permission) =>
							createACLRowConstraint(permission, subjects),
						)
					},
					master: 'bypass',
					operations: aclConstraintOperationKinds,
				}),
			}
		},
	})
	const behaviorProvider = provideRuntimeBehavior({
		contributionId: 'acl-input-and-change-lifecycle',
		create: ({ assertPrivilege, capabilities, owner, schemas }) => {
			const state = readApplicationState(schemas, capabilities)
			const events = createPluginEventDispatcher({
				assertPrivilege,
				capabilities,
				owner,
				requirement: optionalACLChangedEvents,
			})
			const transformInput: RuntimeOperationTransformStage = async <
				const TOperation extends DatabaseOperationAst,
			>({
				context,
				operation,
			}: RuntimeOperationStageInput<TOperation>): Promise<TOperation> => {
				if (
					operation.kind !== 'create-one' &&
					operation.kind !== 'create-many' &&
					operation.kind !== 'upsert-one' &&
					operation.kind !== 'upsert-many'
				) {
					return operation
				}
				const schema = readOperationSchema(operation)
				if (!state.protectedSchemaSet.has(schema)) return operation
				const extension = schema.extensions.find(
					(candidate) => candidate.name === aclSchemaExtensionName,
				)
				if (extension === undefined) {
					throw new TypeError('ACL plugin lost its discovered schema extension')
				}
				const config = extension.config as ACLSchemaExtensionConfig
				const subjects = await state.resolveSubjects()
				const resolved = await resolveCreateOperationACL(
					operation as unknown as ACLCreateOperation,
					config,
					subjects.principal,
					context,
					subjects.roleResolutionAvailable,
					state.resolveSchemaLimits(config),
					state.readPersistentRoleResolver(),
				)
				return resolved as unknown as TOperation
			}

			return {
				value: {
					transformInput,
					transformResult: async (input) => {
						if (input.outcome === undefined) return input.result
						const schema = readOperationSchema(input.operation)
						if (!state.protectedSchemaSet.has(schema)) return input.result
						const kind = input.operation.kind.startsWith('create')
							? 'create'
							: input.operation.kind.startsWith('upsert')
								? 'upsert'
								: 'update'
						const changes = await state.collectACLChanges(
							input.context,
							schema,
							kind,
							input.outcome,
						)
						for (const change of changes) {
							events.emit(input.context, aclChangedEventContract, change)
						}
						return input.result
					},
				},
			}
		},
	})

	return aclPluginModule.plugin({
		privileges: [
			{
				name: 'runtime:constrain',
				reason: 'Applies deny-only ACL guards and adapter constraints.',
			},
			{
				name: 'runtime:intercept',
				reason: 'Resolves ACL input and publishes committed ACL changes.',
			},
			{
				name: 'event:publish',
				reason: 'Publishes committed ACL change notifications.',
			},
		],
		capabilities: {
			optional: [
				optionalPrincipalResolver,
				optionalRoleResolver,
				optionalACLChangedEvents,
			],
			provides: [
				principalReferenceCleanupProvider,
				roleReferenceCleanupProvider,
				replacementShapeProvider,
				inputProvider,
				referenceRowsProvider,
				rowsProvider,
				behaviorProvider,
			],
		},
		setup: ({ access, schemas }) => {
			access.fieldKind(
				'protect-acl-field',
				aclFieldAccessTarget,
				() => ({
					// Generated defaults may fill create candidates, while prepared ACL policy prevents later mutation.
					read: false,
					write: { clear: false, fill: true, replace: false },
				}),
				{ master: 'bypass' },
			)

			return Object.freeze({
				schemas: Object.freeze(readProtectedSchemas(schemas)),
			})
		},
	})
}
