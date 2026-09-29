import {
	requestSubjectReferenceCleanupCapability,
	requestPrincipalResolverCapability,
	requestRoleResolverCapability,
	FrameworkError,
	contributeDeclarations,
	guard,
	optionalCapability,
	plugin,
	preparedOperation,
	protectedPolicy,
	provideCapability,
	provideRuntimeBehavior,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	withPluginPrivileges,
	type DatabaseOperationAst,
	type AddSchemaFieldOperation,
	type CompiledSchemaRegistry,
	type ExecutableOperationAst as ExecutableAst,
	type RuntimeOperationStageInput,
	type RuntimeOperationTransformStage,
	type SchemaDefinition,
	type PluginDeclarationContribution,
	type PluginInstance,
	type PluginSchemaOptionSource,
	type PluginSchemaPatchSource,
	type SchemaSelection,
} from '@ultimabase/core'
import {
	createPluginEventDispatcher,
	definePluginOptionsParser,
	patchSchemas,
	schemaPatch,
	type SchemaPatchBuilder,
} from '@ultimabase/plugin-kit'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	aclChangedEventContract,
	optionalACLChangedEvents,
} from './acl-events.js'
import {
	createACLReferenceCleanups,
	createACLReferenceRowFilter,
	getACLReferenceScope,
} from './acl-reference-cleanup.js'
import {
	defaultACLEntryLimits,
	normalizeACLEntryLimits,
	resolveACLEntryLimits,
	type ACLEntryLimits,
} from './acl-limits.js'
import { createACLRowFilter } from './acl-access.js'
import { createACLFieldPolicy } from './acl-field-policy.js'
import type { ACLPluginOptions } from './plugin-contracts.js'
import {
	aclField,
	aclFieldFamily,
	aclFieldName,
	aclPluginId,
	aclSchemaOption,
	readACLSchemaOption,
} from './acl-option.js'
import {
	hasStaticRoleGrant,
	resolveCreateOperationACL,
	resolvePreparedOperationACL,
	snapshotResolvedACL,
	type ACLCreateOperation,
} from './acl-operation-resolution.js'
export {
	resolveCreateOperationACL,
	resolvePreparedOperationACL,
} from './acl-operation-resolution.js'
import { readOperationSchema } from './runtime-operation.js'
import { createAttributedACLApplicationStateReader } from './subject-resolver-attribution.js'

const aclSchemaSelector = { option: { name: 'acl' } } as const
const aclSchemaPatch: SchemaPatchBuilder<
	readonly [AddSchemaFieldOperation<typeof aclFieldName, typeof aclField>]
> = schemaPatch().addField({
	contributionId: 'acl-field',
	field: aclField,
	name: aclFieldName,
})

type ACLOptionSource = PluginSchemaOptionSource<{
	readonly contributionId: 'official-acl-option'
	readonly schema: Readonly<{ acl: typeof aclSchemaOption }>
}>
type ACLFieldSource = PluginSchemaPatchSource<
	typeof aclSchemaPatch.operations,
	SchemaSelection<typeof aclSchemaSelector>
>
type ACLSource = ACLOptionSource | ACLFieldSource

const aclDeclarations: PluginDeclarationContribution<readonly [], ACLSource> =
	contributeDeclarations({
		schema: ({ fields, schemas }) => {
			fields.register(aclFieldFamily)
			const options = schemas.defineOptions({
				contributionId: 'official-acl-option',
				schema: { acl: aclSchemaOption },
			})
			const field = schemas.patch(
				patchSchemas({
					patch: aclSchemaPatch,
					targets: schemas.select(aclSchemaSelector),
				}),
			)

			return [options, field] as const
		},
	})

/** Represents the exact optional ACL provider configured for one application. */
export type ACLPlugin = PluginInstance<{
	readonly id: typeof aclPluginId
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: ACLSource
}>

const optionalPrincipalResolver = optionalCapability(
	requestPrincipalResolverCapability,
	'^1.0.0',
)
const optionalRoleResolver = optionalCapability(
	requestRoleResolverCapability,
	'^1.0.0',
)

const readProtectedSchemas = (
	schemas: CompiledSchemaRegistry,
): readonly SchemaDefinition[] =>
	schemas.values().filter((schema) => readACLSchemaOption(schema) !== undefined)

const principalReferenceCleanupProvider = provideCapability(
	requestSubjectReferenceCleanupCapability,
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
	requestSubjectReferenceCleanupCapability,
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

/** @internal Rejects ACL replacement without one certain itemized update target. */
export const assertSingularACLReplacement = <TSchema extends SchemaDefinition>(
	operation: ExecutableAst<TSchema>,
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

/**
 * Activates ACL defaults and protected policy behavior for schemas with `acl`.
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
	const readApplicationState = createAttributedACLApplicationStateReader({
		hasStaticRoleGrant,
		pluginLimits,
		principalRequirement: optionalPrincipalResolver,
		readProtectedSchemas,
		roleRequirement: optionalRoleResolver,
		snapshotACL: snapshotResolvedACL,
	})
	const replacementShapeProvider = provideRuntimeConstraint({
		contributionId: 'acl-replacement-shape',
		create: ({ callbacks, capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities, callbacks)
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
	const fieldPolicyProvider = provideRuntimeConstraint({
		contributionId: 'acl-protected-field',
		create: ({ callbacks, capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities, callbacks)

			return {
				value: createACLFieldPolicy(state.protectedSchemaSet),
			}
		},
	})
	const inputProvider = provideRuntimeInterceptor({
		contributionId: 'acl-input',
		create: ({ callbacks, capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities, callbacks)
			return {
				value: preparedOperation({
					handler: async ({ context, operation, target }) => {
						const schema = readOperationSchema(operation)
						if (!state.protectedSchemaSet.has(schema)) return { operation }

						const schemaConfig = readACLSchemaOption(schema)
						if (schemaConfig === undefined) {
							throw new TypeError(
								'ACL plugin lost its discovered schema option',
							)
						}
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
		create: ({ callbacks, capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities, callbacks)
			return {
				value: protectedPolicy({
					evaluate: ({ operation }) => {
						const schema = readOperationSchema(operation)
						if (!state.protectedSchemaSet.has(schema)) return undefined
						const referenceSubject = getACLReferenceScope(schema)
						if (referenceSubject === undefined) return undefined
						return immutableRecord({
							rowFilter: createACLReferenceRowFilter(referenceSubject),
						})
					},
					operations: aclConstraintOperationKinds,
				}),
			}
		},
	})
	const rowsProvider = provideRuntimeConstraint({
		contributionId: 'acl-rows',
		create: ({ callbacks, capabilities, schemas }) => {
			const state = readApplicationState(schemas, capabilities, callbacks)
			return {
				value: protectedPolicy({
					evaluate: async ({ operation }) => {
						const schema = readOperationSchema(operation)
						if (!state.protectedSchemaSet.has(schema)) return undefined
						if (getACLReferenceScope(schema) !== undefined) return undefined
						const rowFilter = createACLRowFilter(
							operation as unknown as ExecutableAst,
							await state.resolveSubjects(),
						)
						if (rowFilter === undefined) return undefined
						return immutableRecord({ rowFilter })
					},
					master: 'bypass',
					operations: aclConstraintOperationKinds,
				}),
			}
		},
	})
	const behaviorProvider = provideRuntimeBehavior({
		contributionId: 'acl-input-and-change-lifecycle',
		create: ({ assertPrivilege, callbacks, capabilities, owner, schemas }) => {
			const state = readApplicationState(schemas, capabilities, callbacks)
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
				const config = readACLSchemaOption(schema)
				if (config === undefined) {
					throw new TypeError('ACL plugin lost its discovered schema option')
				}
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

	const privilegedBehavior = withPluginPrivileges(behaviorProvider, [
		'authority:elevate',
		'event:publish',
	])
	const instance = plugin({
		id: aclPluginId,
		version: '0.0.0',
		core: '^0.0.0',
		permissions: {
			'schema:declare':
				'Declares the direct ACL option and its persisted field patch.',
			'authority:elevate':
				'Maintains persisted ACL references through audited internal Master queries.',
			'runtime:constrain':
				'Applies deny-only ACL guards and adapter constraints.',
			'runtime:intercept':
				'Resolves ACL input and publishes committed ACL changes.',
			'event:publish': 'Publishes committed ACL change notifications.',
		},
		contributions: [
			optionalPrincipalResolver,
			optionalRoleResolver,
			optionalACLChangedEvents,
			principalReferenceCleanupProvider,
			roleReferenceCleanupProvider,
			replacementShapeProvider,
			fieldPolicyProvider,
			inputProvider,
			referenceRowsProvider,
			rowsProvider,
			privilegedBehavior,
			aclDeclarations,
		],
	})
	return instance
}
