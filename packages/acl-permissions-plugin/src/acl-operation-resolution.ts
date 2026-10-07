import {
	RequestSubjectReference,
	applyUpdateExpressionToRecord,
	FrameworkError,
	type ExecutableOperationAst as ExecutableAst,
	type PointerValue,
	type RequestRoleResolver,
	type RequestSubjectContext,
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
	removeACLReference,
	type ACLReferenceSubject,
} from './acl-reference-cleanup.js'
import {
	assertACLEntryLimits,
	defaultACLEntryLimits,
	type ResolvedACLEntryLimits,
} from './acl-limits.js'
import {
	aclFieldName,
	type ACLInputResolver,
	type ACLNormalizedUpdateOperation,
	type NormalizedACLSchemaOption,
} from './acl-option.js'

export type PersistentRoleResolver = NonNullable<
	RequestRoleResolver['resolvePersistentRole']
>

export type ACLCreateOperation = Extract<
	ExecutableAst,
	{ readonly kind: 'create-many' | 'create-one' | 'upsert-many' | 'upsert-one' }
>

interface ACLPreparedUpdateOperation {
	readonly kind: 'update-one'
	readonly query: Readonly<{
		readonly schema: Readonly<{ readonly definition: SchemaDefinition }>
	}>
	readonly update: unknown
}

/** Carries the request facts needed to validate one accepted ACL value. */
interface ACLAcceptance {
	readonly context: RequestSubjectContext
	readonly limits: ResolvedACLEntryLimits
	readonly resolvePersistentRole: PersistentRoleResolver | undefined
	readonly roleResolutionAvailable: boolean
}

/** Groups the request facts shared by every ACL value resolved in one operation. */
interface ACLResolution<
	TData extends Readonly<Record<string, unknown>>,
> extends ACLAcceptance {
	readonly config: NormalizedACLSchemaOption<TData>
	readonly principal: PointerValue | undefined
}

export const snapshotResolvedACL = (value: unknown, path: string): ACL => {
	if (!(value instanceof ACL)) {
		throw new TypeError(`${path} must resolve to an ACL`)
	}

	return value
}

/** Detects declarations that cannot become valid without role capabilities. */
export const hasStaticRoleGrant = (
	config: NormalizedACLSchemaOption,
): boolean =>
	config.default instanceof ACL && config.default.toJSON().roles.length > 0

/** Keeps ACL-document management behind trusted server authority. */
const assertMasterACLManagement = (context: RequestSubjectContext): void => {
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

/** Explicit ACL values are accepted only through a declared schema resolver. */
const requireResolveInput = <TData extends Readonly<Record<string, unknown>>>(
	config: NormalizedACLSchemaOption<TData>,
): ACLInputResolver<TData> => {
	if (config.resolveInput === undefined) {
		throw new TypeError(
			'Explicit ACL input requires an acl.resolveInput declaration',
		)
	}
	return config.resolveInput
}

/** Projects only developer fields so create and update callbacks share one data shape. */
const projectACLData = (
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(input).filter(([fieldName]) => {
				const field = schema.persistedFields[fieldName]

				return (
					field !== undefined &&
					schema.provenance.fields[fieldName]?.owner.kind === 'application' &&
					!('system' in field.options && field.options.system === true)
				)
			}),
		),
	)

/**
 * Applies every adapter-neutral invariant to one accepted ACL value: role
 * grants need membership resolution, logical roles become stable provider
 * identities, and the canonical result must respect the entry limits.
 */
const acceptACL = async (
	candidate: unknown,
	path: string,
	{
		context,
		limits,
		resolvePersistentRole,
		roleResolutionAvailable,
	}: ACLAcceptance,
): Promise<ACL> => {
	const value = snapshotResolvedACL(candidate, path)
	const document = value.toJSON()
	let accepted = value

	if (document.roles.length > 0) {
		if (!roleResolutionAvailable) {
			throw new TypeError(
				'ACL role grants require a role resolver with current-role enumeration',
			)
		}
		if (resolvePersistentRole === undefined) {
			throw new TypeError(
				'ACL role grants require a role resolver with persistent-role resolution',
			)
		}
		const roles = await Promise.all(
			document.roles.map(async ({ permissions, value: role }) => {
				const resolved = await resolvePersistentRole({
					context,
					role: new RequestSubjectReference('role', role),
				})
				if (!(resolved instanceof RequestSubjectReference)) {
					throw new TypeError(`ACL role could not be resolved: ${role}`)
				}
				return { kind: 'role' as const, permissions, value: resolved.value }
			}),
		)
		// Canonical parsing already unions aliases that resolve to the same role.
		accepted = ACL.fromJSON({ ...document, roles })
	}

	assertACLEntryLimits(accepted, limits)
	return accepted
}

const resolveCreateInputACL = async <
	TData extends Readonly<Record<string, unknown>>,
>(
	schema: SchemaDefinition,
	input: Readonly<Record<string, unknown>>,
	resolution: ACLResolution<TData>,
): Promise<Readonly<Record<string, unknown>>> => {
	const { config, context, principal } = resolution
	// The schema-targeted hook guarantees this extension's declared developer-data shape.
	const data = projectACLData(schema, input) as TData
	const inputAcl = Object.hasOwn(input, aclFieldName)
		? snapshotResolvedACL(input[aclFieldName], 'acl input')
		: undefined

	if (inputAcl !== undefined) {
		assertMasterACLManagement(context)
		requireResolveInput(config)
	}

	const resolved = await config.resolveInput?.({
		context,
		currentAcl: undefined,
		currentData: undefined,
		data,
		inputAcl,
		operation: 'create',
		principal,
		update: undefined,
	})
	const acl =
		resolved !== undefined
			? await acceptACL(resolved, 'acl resolveInput', resolution)
			: await acceptACL(
					typeof config.default === 'function'
						? await config.default({ context, data, principal })
						: config.default,
					'acl default',
					resolution,
				)

	return immutableRecord({ ...input, [aclFieldName]: acl })
}

/** @internal Applies ACL create semantics before Runtime structural revalidation. */
export const resolveCreateOperationACL = async <
	const TOperation extends ACLCreateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	config: NormalizedACLSchemaOption<TData>,
	principal: PointerValue | undefined,
	context: RequestSubjectContext,
	roleResolutionAvailable = false,
	limits: ResolvedACLEntryLimits = defaultACLEntryLimits,
	resolvePersistentRole?: PersistentRoleResolver,
): Promise<TOperation> => {
	const resolution = {
		config,
		context,
		limits,
		principal,
		resolvePersistentRole,
		roleResolutionAvailable,
	}
	const schema =
		operation.kind === 'upsert-one'
			? operation.query.schema.definition
			: operation.schema.definition
	const resolve = (
		input: Readonly<Record<string, unknown>>,
	): Promise<Readonly<Record<string, unknown>>> =>
		resolveCreateInputACL(schema, input, resolution)

	switch (operation.kind) {
		case 'create-one':
			return immutableRecord({
				...operation,
				input: await resolve(operation.input),
			})
		case 'create-many':
			return immutableRecord({
				...operation,
				inputs: immutableArray(
					await Promise.all(operation.inputs.map((input) => resolve(input))),
				),
			})
		case 'upsert-one':
			return immutableRecord({
				...operation,
				create: await resolve(operation.create),
			})
		case 'upsert-many':
			return immutableRecord({
				...operation,
				items: immutableArray(
					await Promise.all(
						operation.items.map(async (item) =>
							immutableRecord({ ...item, create: await resolve(item.create) }),
						),
					),
				),
			})
	}
}

/** Detaches the normalized non-ACL update operations exposed to schema callbacks. */
const snapshotUpdateOperations = (
	operations: readonly unknown[],
): readonly ACLNormalizedUpdateOperation[] =>
	immutableArray(
		operations.flatMap((candidate) => {
			if (
				!isPlainRecord(candidate) ||
				typeof candidate.field !== 'string' ||
				typeof candidate.kind !== 'string'
			) {
				throw new TypeError('ACL update contains an invalid operation')
			}
			if (candidate.field === aclFieldName) return []
			if (
				(candidate.kind !== 'decrement' &&
					candidate.kind !== 'increment' &&
					candidate.kind !== 'set') ||
				!Object.hasOwn(candidate, 'value')
			) {
				throw new TypeError('ACL update contains an unsupported operation')
			}
			const { field, kind, value } = candidate
			return [immutableRecord({ field, kind, value })]
		}),
	)

/** Resolves the only supported row-aware ACL replacement after Access approval. */
export const resolvePreparedOperationACL = async <
	const TOperation extends ACLPreparedUpdateOperation,
	TData extends Readonly<Record<string, unknown>>,
>(
	operation: TOperation,
	target: Readonly<Record<string, unknown>>,
	config: NormalizedACLSchemaOption<TData>,
	principal: PointerValue | undefined,
	context: RequestSubjectContext,
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

	if (!isPlainRecord(aclOperation)) return operation

	assertMasterACLManagement(context)

	let resolvedAcl: ACL
	if (referenceCleanup !== undefined) {
		// Subject cleanup removes one exact entry from the locked current value.
		resolvedAcl = removeACLReference(
			snapshotResolvedACL(target[aclFieldName], 'current acl'),
			referenceCleanup,
		)
	} else {
		if (aclOperation.kind !== 'set' || !Object.hasOwn(aclOperation, 'value')) {
			throw new TypeError('ACL update must replace the complete ACL value')
		}
		const resolveInput = requireResolveInput(config)
		const currentAcl = snapshotResolvedACL(target[aclFieldName], 'current acl')
		const inputAcl = snapshotResolvedACL(aclOperation.value, 'acl input')
		const schema = operation.query.schema.definition
		const normalizedUpdate = immutableRecord({
			kind: 'update-expression' as const,
			operations: update.operations,
		})
		// Structural revalidation has normalized every operation before this locked callback.
		// Only `undefined` keeps the current value; any other result must be an ACL.
		const resolved: unknown = await resolveInput({
			context,
			currentAcl,
			currentData: projectACLData(schema, target) as TData,
			data: projectACLData(
				schema,
				applyUpdateExpressionToRecord(schema, target, normalizedUpdate),
			) as TData,
			inputAcl,
			operation: 'update',
			principal,
			update: immutableRecord({
				kind: 'update-expression',
				operations: snapshotUpdateOperations(update.operations),
			}),
		})
		resolvedAcl = await acceptACL(
			resolved === undefined ? currentAcl : resolved,
			'acl resolveInput',
			{ context, limits, resolvePersistentRole, roleResolutionAvailable },
		)
	}

	const operations = update.operations.map((candidate) =>
		candidate === aclOperation
			? immutableRecord({ ...aclOperation, value: resolvedAcl })
			: candidate,
	)

	return immutableRecord({
		...operation,
		update: immutableRecord({
			...update,
			operations: immutableArray(operations),
		}),
	})
}
