import {
	AccessSubjectReference,
	accessPrincipalResolverServiceToken,
	accessRoleResolverServiceToken,
	constraint,
	defineFieldKindAccessTarget,
	definePlugin,
	extensionHandlerKey,
	FrameworkError,
	getCurrentEngine,
	getCurrentRequest,
	guard,
	preparedOperation,
	type AccessRoleResolver,
	type ExecutableOperationAst,
	type FrameworkPlugin,
	type HookContext,
	type PointerValue,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { ACL } from './acl.js'
import {
	aclChangedEvent,
	aclFieldHookTarget,
	createACLChangedEvent,
	onACLChange,
} from './acl-events.js'
import {
	createACLReferenceCleanups,
	createACLReferenceConstraint,
	getACLReferenceScope,
	removeACLReference,
	type ACLReferenceConstraint,
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
import {
	createACLRowConstraint,
	requiredACLPermissions,
	resolveACLAccessSubjects,
	type ACLRowConstraint,
} from './acl-access.js'
import {
	acl,
	aclFieldName,
	aclFieldKind,
	aclPluginName,
	aclSchemaExtensionName,
	type ACLSchemaExtensionConfig,
	type ACLField,
} from './acl-extension.js'

type ACLCreateOperation = Extract<
	ExecutableOperationAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

interface ACLPreparedUpdateOperation {
	readonly kind: 'update-one'
	readonly update: unknown
}

/** Exposes ACL-enabled schemas discovered in one application. */
export interface ACLPluginExports {
	readonly schemas: readonly SchemaDefinition[]
}

/** Configures application-wide defaults for persisted ACL size. */
export interface ACLPluginOptions {
	/**
	 * Sets finite subject-entry limits inherited by every ACL-enabled schema.
	 *
	 * Canonical duplicate grants count once. Public and authenticated grants do
	 * not consume either limit.
	 *
	 * @default `{ maxPrincipals: 100, maxRoles: 50 }`
	 * @example `limits: { maxPrincipals: 100, maxRoles: 50 }`
	 */
	readonly limits?: ACLEntryLimits
}

/** Represents the optional ACL provider configured for one application. */
export type ACLPlugin = FrameworkPlugin<
	typeof aclPluginName,
	ACLPluginExports,
	undefined,
	undefined,
	undefined,
	undefined,
	never
>

const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

const normalizeACLPluginOptions = (
	options: ACLPluginOptions,
): Readonly<ACLPluginOptions> => {
	const untrustedOptions: unknown = options

	if (!isPlainRecord(untrustedOptions)) {
		throw new TypeError('aclPlugin options must be a plain object')
	}

	const unknownKey = Object.keys(options).find((key) => key !== 'limits')

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown aclPlugin option: ${unknownKey}`)
	}

	const limits = normalizeACLEntryLimits(options.limits, 'aclPlugin limits')

	return immutableRecord(limits === undefined ? {} : { limits })
}

/** Keeps ACL-document management behind trusted server authority. */
const assertMasterACLManagement = (context: HookContext): void => {
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

/** Removes the reserved ACL value before schema-local callbacks observe row data. */
const omitACL = (
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(input).filter(([fieldName]) => fieldName !== aclFieldName),
		),
	)

const resolveDefaultACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	config: ACLSchemaExtensionConfig<TData>,
	data: TData,
	principal: PointerValue | undefined,
	context: HookContext,
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

type PersistentRoleResolver = NonNullable<
	AccessRoleResolver['resolvePersistentRole']
>

/** Replaces every logical role selector with its stable provider-owned identity. */
const resolvePersistentACLRoles = async (
	value: ACL,
	context: HookContext,
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
	context: HookContext,
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

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	input: Readonly<Record<string, unknown>>,
	config: ACLSchemaExtensionConfig<TData>,
	principal: PointerValue | undefined,
	context: HookContext,
	roleResolutionAvailable: boolean,
	limits: ResolvedACLEntryLimits,
	resolvePersistentRole: PersistentRoleResolver | undefined,
): Promise<Readonly<Record<string, unknown>>> => {
	// The schema-targeted hook guarantees this extension's declared create-data shape.
	const data = omitACL(input) as TData
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
		data,
		inputAcl: explicitACL,
		operation: 'create',
		principal,
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
	context: HookContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolveCreateInputACL(
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
	context: HookContext,
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
	// The normalized schema update guarantees this extension's declared data shape.
	const data = immutableRecord(
		Object.fromEntries(
			update.operations.flatMap((candidate) =>
				isPlainRecord(candidate) &&
				candidate.field !== aclFieldName &&
				typeof candidate.field === 'string' &&
				Object.hasOwn(candidate, 'value')
					? [[candidate.field, candidate.value] as const]
					: [],
			),
		),
	) as TData
	const resolved = await config.resolveInput({
		context,
		currentAcl,
		data,
		inputAcl,
		operation: 'update',
		principal,
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

const aclExtensionTarget = acl()
const aclFieldAccessTarget = defineFieldKindAccessTarget<ACLField>(aclFieldKind)

const aclConstraintOperationKinds = Object.freeze([
	'count',
	'delete-many',
	'delete-one',
	'exists',
	'find',
	'first',
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

type ACLDatabaseConstraint = ACLReferenceConstraint | ACLRowConstraint
const emptyACLChangeValue = new ACL()

const updateTouchesACL = (update: unknown): boolean =>
	isPlainRecord(update) &&
	isUnknownArray(update.operations) &&
	update.operations.some(
		(candidate) => isPlainRecord(candidate) && candidate.field === aclFieldName,
	)

/** @internal Rejects set-based ACL replacement before adapter execution. */
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
		{ publicMessage: 'ACL values can only be replaced with updateOne().' },
	)
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

	return definePlugin({
		name: aclPluginName,
		setup: ({ access, hooks, registries, schemas, services }) => {
			// ACL changes are optional notifications; this built-in observer prevents absent audit plugins from blocking writes.
			registries.events.register(
				'acl-change-notification-boundary',
				onACLChange(() => undefined),
			)
			registries.extensions.register(
				extensionHandlerKey('schema', aclSchemaExtensionName),
				true,
			)
			const subjectCache = new WeakMap<
				object,
				ReturnType<typeof resolveACLAccessSubjects>
			>()
			const roleResolver = services.getOptional(accessRoleResolverServiceToken)
			const persistentRoleResolver =
				roleResolver?.resolvePersistentRole?.bind(roleResolver)
			const resolvePersistentRole: PersistentRoleResolver | undefined =
				persistentRoleResolver === undefined
					? undefined
					: ({ role }) =>
							persistentRoleResolver.call(roleResolver, {
								// Providers resolve against the original request instead of a derived hook view.
								context: getCurrentRequest(),
								role,
							})
			const resolveSubjects = () => {
				// The engine is the stable cache owner shared by every hook context in one operation.
				const cacheKey = getCurrentEngine()
				const cached = subjectCache.get(cacheKey)

				if (cached !== undefined) return cached

				const resolution = resolveACLAccessSubjects(
					// Subject providers receive the original request, not a derived hook view.
					getCurrentRequest(),
					services.getOptional(accessPrincipalResolverServiceToken),
					roleResolver,
					(schema) => schemas.get(schema.className) === schema,
				)
				subjectCache.set(cacheKey, resolution)

				return resolution
			}
			const resolveSchemaLimits = (
				config: ACLSchemaExtensionConfig,
			): ResolvedACLEntryLimits =>
				resolveACLEntryLimits(pluginLimits, config.limits)
			hooks.fieldKind(
				'emit-acl-change-event',
				aclFieldHookTarget,
				({ schema }) => ({
					onChange: async ({ context, change, itemId, kind }) => {
						if (!change.current.present || kind === 'delete-one') return

						const subjects = await resolveSubjects()
						const payload = createACLChangedEvent({
							authority: context.access.mode,
							className: schema.className,
							current: change.current.value,
							itemId,
							operation: kind,
							previous: change.previous.present
								? change.previous.value
								: emptyACLChangeValue,
							principal: subjects.principal,
						})

						// Core buffers named events and delivers them only after outer commit.
						context.emit(aclChangedEvent, payload)
					},
				}),
			)
			hooks.schemaExtension(
				'resolve-create-input',
				aclExtensionTarget,
				({ extension }) => ({
					resolveInput: {
						create: async ({ context, operation }) => {
							const subjects = await resolveSubjects()

							return resolveCreateOperationACL(
								operation,
								extension.config,
								subjects.principal,
								context,
								subjects.roleResolutionAvailable,
								resolveSchemaLimits(extension.config),
								resolvePersistentRole,
							)
						},
						upsert: async ({ context, operation }) => {
							const subjects = await resolveSubjects()

							return resolveCreateOperationACL(
								operation,
								extension.config,
								subjects.principal,
								context,
								subjects.roleResolutionAvailable,
								resolveSchemaLimits(extension.config),
								resolvePersistentRole,
							)
						},
					},
				}),
			)
			access.fieldKind(
				'protect-acl-field',
				aclFieldAccessTarget,
				() => ({
					// Generated defaults may enter create candidates, but only master may inspect or replace ACL values.
					create: true,
					read: false,
					update: false,
				}),
				{ master: 'bypass' },
			)

			const protectedSchemas = schemas
				.values()
				.filter((schema) =>
					schema.extensions.some(
						(extension) => extension.name === aclSchemaExtensionName,
					),
				)
			const referenceCleanups = createACLReferenceCleanups(protectedSchemas)

			registries.commands.register(
				'acl-principal-reference-cleanup',
				referenceCleanups.principal,
			)
			registries.commands.register(
				'acl-role-reference-cleanup',
				referenceCleanups.role,
			)

			for (const schema of protectedSchemas) {
				const extension = schema.extensions.find(
					(candidate) => candidate.name === aclSchemaExtensionName,
				)

				if (extension === undefined) {
					throw new TypeError('ACL plugin lost its discovered schema extension')
				}
				const schemaConfig = extension.config as ACLSchemaExtensionConfig
				const schemaLimits = resolveSchemaLimits(schemaConfig)

				registries.hooks.register(
					`acl-replacement-shape:${schema.className}`,
					guard({
						handler: ({ operation }) => {
							// Mutation shape is a data invariant, so trusted master execution must enforce it too.
							assertSingularACLReplacement(operation)
						},
						operations: aclReplacementInvariantOperationKinds,
						schema,
					}),
				)
				registries.hooks.register(
					`acl-input:${schema.className}`,
					preparedOperation({
						handler: async ({ context, operation, target }) => {
							const subjects = await resolveSubjects()

							return {
								operation: await resolvePreparedOperationACL(
									operation,
									target,
									schemaConfig,
									subjects.principal,
									context,
									subjects.roleResolutionAvailable,
									schemaLimits,
									resolvePersistentRole,
									getACLReferenceScope(schema),
								),
							}
						},
						schema,
					}),
				)
				registries.hooks.register(
					`acl-reference-rows:${schema.className}`,
					constraint<
						typeof schema,
						typeof aclConstraintOperationKinds,
						ACLDatabaseConstraint
					>({
						handler: () => {
							const referenceSubject = getACLReferenceScope(schema)

							if (referenceSubject !== undefined) {
								return createACLReferenceConstraint(referenceSubject)
							}

							return immutableArray([])
						},
						operations: aclConstraintOperationKinds,
						schema,
					}),
				)
				registries.hooks.register(
					`acl-rows:${schema.className}`,
					constraint<
						typeof schema,
						typeof aclConstraintOperationKinds,
						ACLDatabaseConstraint
					>({
						handler: async ({ operation }) => {
							if (getACLReferenceScope(schema) !== undefined) {
								return immutableArray([])
							}

							const subjects = await resolveSubjects()

							return requiredACLPermissions(operation).map((permission) =>
								createACLRowConstraint(permission, subjects),
							)
						},
						master: 'bypass',
						operations: aclConstraintOperationKinds,
						schema,
					}),
				)
			}

			return Object.freeze({ schemas: Object.freeze(protectedSchemas) })
		},
	})
}
