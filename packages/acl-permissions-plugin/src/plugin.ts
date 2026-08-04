import {
	accessPrincipalResolverServiceToken,
	accessRoleResolverServiceToken,
	constraint,
	defineFieldKindAccessTarget,
	definePlugin,
	extensionHandlerKey,
	FrameworkError,
	getCurrentEngine,
	preparedOperation,
	type AccessContext,
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
	createACLRowConstraint,
	requiredACLPermissions,
	resolveACLAccessSubjects,
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

/** Represents the zero-option ACL provider before entry limits are added by issue 428. */
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

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	input: Readonly<Record<string, unknown>>,
	config: ACLSchemaExtensionConfig<TData>,
	principal: PointerValue | undefined,
	context: HookContext,
	roleResolutionAvailable: boolean,
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
	const resolvedACL =
		resolvedInput === undefined
			? await resolveDefaultACL(config, data, principal, context)
			: snapshotResolvedACL(resolvedInput, 'acl resolveInput')
	assertACLRoleResolution(resolvedACL, roleResolutionAvailable)

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
	const resolvedAcl =
		resolved === undefined
			? currentAcl
			: snapshotResolvedACL(resolved, 'acl resolveInput')
	assertACLRoleResolution(resolvedAcl, roleResolutionAvailable)
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
 * services; applications without authentication remain valid.
 */
export const aclPlugin = (): ACLPlugin =>
	definePlugin({
		name: aclPluginName,
		setup: ({ access, hooks, registries, schemas, services }) => {
			registries.extensions.register(
				extensionHandlerKey('schema', aclSchemaExtensionName),
				true,
			)
			const subjectCache = new WeakMap<
				object,
				ReturnType<typeof resolveACLAccessSubjects>
			>()
			const resolveSubjects = (context: AccessContext) => {
				// The engine is the stable cache owner shared by every hook context in one operation.
				const cacheKey = getCurrentEngine()
				const cached = subjectCache.get(cacheKey)

				if (cached !== undefined) return cached

				const resolution = resolveACLAccessSubjects(
					context,
					services.getOptional(accessPrincipalResolverServiceToken),
					services.getOptional(accessRoleResolverServiceToken),
					(schema) => schemas.get(schema.className) === schema,
				)
				subjectCache.set(cacheKey, resolution)

				return resolution
			}
			hooks.schemaExtension(
				'resolve-create-input',
				aclExtensionTarget,
				({ extension }) => ({
					resolveInput: {
						create: async ({ context, operation }) => {
							const subjects = await resolveSubjects(context)

							return resolveCreateOperationACL(
								operation,
								extension.config,
								subjects.principal,
								context,
								subjects.roleResolutionAvailable,
							)
						},
						upsert: async ({ context, operation }) => {
							const subjects = await resolveSubjects(context)

							return resolveCreateOperationACL(
								operation,
								extension.config,
								subjects.principal,
								context,
								subjects.roleResolutionAvailable,
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

			for (const schema of protectedSchemas) {
				const extension = schema.extensions.find(
					(candidate) => candidate.name === aclSchemaExtensionName,
				)

				if (extension === undefined) {
					throw new TypeError('ACL plugin lost its discovered schema extension')
				}

				registries.hooks.register(
					`acl-input:${schema.className}`,
					preparedOperation({
						handler: async ({ context, operation, target }) => {
							const subjects = await resolveSubjects(context)

							return {
								operation: await resolvePreparedOperationACL(
									operation,
									target,
									extension.config as ACLSchemaExtensionConfig,
									subjects.principal,
									context,
									subjects.roleResolutionAvailable,
								),
							}
						},
						schema,
					}),
				)
				registries.hooks.register(
					`acl-rows:${schema.className}`,
					constraint({
						handler: async ({ context, operation }) => {
							assertSingularACLReplacement(operation)

							if (context.access.mode === 'master') return immutableArray([])

							const subjects = await resolveSubjects(context)

							return requiredACLPermissions(operation).map((permission) =>
								createACLRowConstraint(permission, subjects),
							)
						},
						operations: aclConstraintOperationKinds,
						schema,
					}),
				)
			}

			return Object.freeze({ schemas: Object.freeze(protectedSchemas) })
		},
	})
