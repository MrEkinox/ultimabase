import {
	requestSubjectReferenceCleanupCapability,
	FrameworkError,
	guard,
	preparedOperation,
	protectedPolicy,
	provideRuntimeBehavior,
	provideRuntimeConstraint,
	provideRuntimeInterceptor,
	type DatabaseOperationAst,
	type ExecutableOperationAst as ExecutableAst,
	type RuntimeConstraintDefinition,
	type RuntimeLogicalMutationOperationAst,
	type RuntimeOperationStageInput,
	type RuntimeOperationTransformStage,
	type RuntimePreparedMutationStageInput,
	type RuntimePreparedMutationTransformStage,
	type SchemaDefinition,
	type SchemaItem,
} from '@ultimabase/core'
import {
	contributeDeclarations,
	plugin,
	provideCapability,
	withPluginPrivileges,
	type AddSchemaFieldOperation,
	type PluginDeclarationContribution,
	type PluginInstance,
	type PluginSchemaFeatureSource,
	type PluginSchemaFieldsSource,
	type PluginSchemaRulesSource,
	type SchemaFeature,
	type SchemaFieldsHKT,
	type SchemaRulesHKT,
	provideSchemaFeatures,
	provideSchemaRules,
} from '@ultimabase/core/plugin'
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
	createACLPermissionRowFilter,
	requiredACLPermission,
} from './acl-access.js'
import {
	aclChangedEventContract,
	optionalACLChangedEvents,
} from './acl-events.js'
import { createACLFieldPolicy } from './acl-field-policy.js'
import {
	defaultACLEntryLimits,
	normalizeACLEntryLimits,
	resolveACLEntryLimits,
	type ACLEntryLimits,
	type ACLPluginOptions,
} from './acl-limits.js'
import {
	aclField,
	aclFieldFamily,
	aclFieldName,
	aclPluginId,
	aclSchemaOption,
	aclFeatureDeclared,
	readProtectedSchemaOptions,
	type ACLField,
	type ACLRule,
} from './acl-option.js'
import {
	resolveCreateOperationACL,
	type ACLCreateOperation,
} from './acl-operation-resolution.js'
import {
	recomputeUpdateOperationACL,
	resolvePreparedOperationACL,
	type ACLPreparedUpdateOperation,
} from './acl-update-resolution.js'
import {
	createACLReferenceCleanups,
	createACLReferenceRowFilter,
	getACLReferenceScope,
} from './acl-reference-cleanup.js'
import {
	createACLApplicationStateReader,
	optionalRoleResolver,
	type ACLApplicationState,
} from './application-state.js'

export { resolveCreateOperationACL } from './acl-operation-resolution.js'
export {
	recomputeUpdateOperationACL,
	resolvePreparedOperationACL,
} from './acl-update-resolution.js'

const aclSchemaSelector = { option: { name: 'acl' } } as const
const aclSchemaPatch: SchemaPatchBuilder<
	readonly [AddSchemaFieldOperation<typeof aclFieldName, typeof aclField>]
> = schemaPatch().addField({
	contributionId: 'acl-field',
	field: aclField,
	name: aclFieldName,
})

/** Values an ACL rule sees: the persisted developer fields, without the ACL. */
type ACLRuleData<TSchema> = TSchema extends SchemaDefinition
	? Omit<
			SchemaItem<TSchema>,
			typeof aclFieldName | 'createdAt' | 'id' | 'updatedAt'
		>
	: Readonly<Record<string, unknown>>

/** Rule of `.with((plugins) => …)` owned by ACL, required once `acl: true`. */
export interface ACLRules<TSchema> {
	/**
	 * Configures the `acl` field that `acl: true` adds; `default` is required.
	 * @example `.with((plugins) => plugins.acl({ default: ({ principal }) => new ACL(principal) }))`
	 */
	readonly acl: ACLRule<ACLRuleData<TSchema>>
}

/**
 * Contributes `acl` to `.with((plugins) => …)` through Core's rules slot,
 * required once `define` sets `acl: true` (ADR-0321, ADR-0339).
 */
export interface ACLSchemaRules extends SchemaRulesHKT {
	readonly rules: 'acl' extends keyof this['shape']
		? ACLRules<this['schema']>
		: Readonly<Record<never, never>>
}

/** Adds the `acl` field through Core's fields slot once `define` sets `acl: true`. */
export interface ACLFeatureFields extends SchemaFieldsHKT {
	readonly fields: 'acl' extends keyof this['shape']
		? Readonly<{ acl: ACLField }>
		: unknown
}

/** The `acl` feature, a key of `define`: `acl: true` adds the `acl` field (ADR-0339). */
export type ACLFeatureSource = PluginSchemaFeatureSource<{
	/**
	 * Adds the ACL field: per-row rights stored with each row (ADR-0321).
	 * Requires `.with((plugins) => plugins.acl({ default }))`.
	 * @example `App.Schema.define({ className: 'Todo', fields, acl: true }).with((plugins) => plugins.acl({ default: ({ principal }) => new ACL(principal) }))`
	 */
	readonly acl: SchemaFeature<readonly [], Readonly<{ acl: object }>, 'acl'>
}>

type ACLSource =
	| PluginSchemaFieldsSource<ACLFeatureFields>
	| PluginSchemaRulesSource<ACLSchemaRules>
	| ACLFeatureSource

const aclDeclarations: PluginDeclarationContribution<readonly [], never> =
	contributeDeclarations({
		schema: ({ fields, schemas }) => {
			fields.register(aclFieldFamily)
			schemas.defineOptions({
				contributionId: 'official-acl-option',
				schema: { acl: aclSchemaOption },
			})
			schemas.patch(
				patchSchemas({
					patch: aclSchemaPatch,
					targets: schemas.select(aclSchemaSelector),
				}),
			)
			return undefined
		},
	})

/** Represents the exact optional ACL provider configured for one application. */
export type ACLPlugin = PluginInstance<{
	readonly id: typeof aclPluginId
	readonly version: '0.0.0'
	readonly core: '^0.0.0'
	readonly source: ACLSource
}>

/** Lets subject owners inspect or cascade ACL references to one deleted subject. */
const referenceCleanupProvider = (kind: 'principal' | 'role') =>
	provideCapability(requestSubjectReferenceCleanupCapability, {
		contributionId: `${kind}-references`,
		create: ({ schemas }) => ({
			value: immutableRecord({
				cleanup: createACLReferenceCleanups([
					...readProtectedSchemaOptions(schemas).keys(),
				])[kind],
				name: `acl-${kind}-reference-cleanup`,
			}),
		}),
	})

const principalReferenceCleanupProvider = referenceCleanupProvider('principal')
const roleReferenceCleanupProvider = referenceCleanupProvider('role')

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

/** `resolveInput` recomputes each row's ACL: set-based updates cannot. */
const assertRecomputableUpdate = (
	operation: ExecutableAst,
	option: Readonly<{
		config: Readonly<{ resolveInput: unknown }>
		schema: SchemaDefinition
	}>,
): void => {
	if (
		operation.kind !== 'update-many' ||
		option.config.resolveInput === undefined
	) {
		return
	}
	throw new FrameworkError(
		'VALIDATION_ERROR',
		`${option.schema.className} declares acl.resolveInput, which recomputes each row's ACL: use updateOne() or an itemized updateMany().`,
		{
			publicMessage: 'This update must target one row at a time.',
		},
	)
}

const updateTouchesACL = (update: unknown): boolean =>
	isPlainRecord(update) &&
	isUnknownArray(update.operations) &&
	update.operations.some(
		(candidate) => isPlainRecord(candidate) && candidate.field === aclFieldName,
	)

/** Rejects ACL replacement without one certain itemized update target. */
const assertSingularACLReplacement = <TSchema extends SchemaDefinition>(
	operation: ExecutableAst<TSchema>,
): void => {
	const unsupported =
		operation.kind === 'update-many' || operation.kind === 'upsert-one'
			? updateTouchesACL(operation.update)
			: operation.kind === 'upsert-many' &&
				operation.items.some(({ update }) => updateTouchesACL(update))

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
	const { limits } = normalizeACLPluginOptions(options)
	const readState = createACLApplicationStateReader(
		resolveACLEntryLimits(defaultACLEntryLimits, limits),
	)
	const stateConstraint = (
		contributionId: string,
		build: (state: ACLApplicationState) => RuntimeConstraintDefinition,
	) =>
		provideRuntimeConstraint({
			contributionId,
			create: (context) => ({ value: build(readState(context)) }),
		})
	const replacementShapeProvider = stateConstraint(
		'acl-replacement-shape',
		(state) =>
			guard({
				handler: ({ operation }) => {
					// Mutation shape is a data invariant, so trusted master execution must enforce it too.
					const option = state.protectedOption(operation)
					if (option !== undefined) {
						assertSingularACLReplacement(operation)
						assertRecomputableUpdate(operation, option)
					}
				},
				operations: aclReplacementInvariantOperationKinds,
			}),
	)
	const fieldPolicyProvider = stateConstraint('acl-protected-field', (state) =>
		createACLFieldPolicy(state),
	)
	const inputProvider = provideRuntimeInterceptor({
		contributionId: 'acl-input',
		create: (factoryContext) => {
			const state = readState(factoryContext)
			return {
				value: preparedOperation({
					handler: async ({ context, operation, target }) => {
						const option = state.protectedOption(operation)
						if (option === undefined) return { operation }
						const subjects = await state.resolveSubjects()

						return {
							operation: await resolvePreparedOperationACL(
								operation,
								target,
								option.config,
								subjects.principal,
								context,
								subjects.roleResolutionAvailable,
								option.limits,
								state.persistentRoleResolver,
								getACLReferenceScope(option.schema),
								subjects.roles,
							),
						}
					},
				}),
			}
		},
	})
	// Internal cleanup queries see only rows referencing the subject being removed.
	const referenceRowsProvider = stateConstraint('acl-reference-rows', (state) =>
		protectedPolicy({
			evaluate: ({ operation }) => {
				const option = state.protectedOption(operation)
				const subject =
					option === undefined ? undefined : getACLReferenceScope(option.schema)
				return subject === undefined
					? undefined
					: immutableRecord({
							rowFilter: createACLReferenceRowFilter(subject),
						})
			},
			operations: aclConstraintOperationKinds,
		}),
	)
	const rowsProvider = stateConstraint('acl-rows', (state) =>
		protectedPolicy({
			evaluate: async ({ operation }) => {
				const option = state.protectedOption(operation)
				if (option === undefined) return undefined
				if (getACLReferenceScope(option.schema) !== undefined) return undefined
				// `operations` limits this policy to executable terminals Core types broadly.
				const permission = requiredACLPermission(
					operation as unknown as ExecutableAst,
					option.config.clientSharing !== undefined,
				)
				if (permission === undefined) return undefined
				return immutableRecord({
					rowFilter: createACLPermissionRowFilter(
						permission,
						await state.resolveSubjects(),
					),
				})
			},
			master: 'bypass',
			operations: aclConstraintOperationKinds,
		}),
	)
	const behaviorProvider = provideRuntimeBehavior({
		contributionId: 'acl-input-and-change-lifecycle',
		create: (factoryContext) => {
			const state = readState(factoryContext)
			const events = createPluginEventDispatcher({
				assertPrivilege: factoryContext.assertPrivilege,
				capabilities: factoryContext.capabilities,
				owner: factoryContext.owner,
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
				const option = state.protectedOption(operation)
				if (option === undefined) return operation
				const subjects = await state.resolveSubjects()
				const resolved = await resolveCreateOperationACL(
					operation as unknown as ACLCreateOperation,
					option.config,
					subjects.principal,
					context,
					subjects.roleResolutionAvailable,
					option.limits,
					state.persistentRoleResolver,
				)
				return resolved as unknown as TOperation
			}

			const transformPreparedInput: RuntimePreparedMutationTransformStage =
				async <const TOperation extends RuntimeLogicalMutationOperationAst>(
					input: RuntimePreparedMutationStageInput<TOperation, unknown>,
				): Promise<TOperation> => {
					const { context, operation, target } = input
					const option = state.protectedOption(operation)
					if (
						operation.kind !== 'update-one' ||
						option?.config.resolveInput === undefined ||
						!isPlainRecord(target) ||
						getACLReferenceScope(option.schema) !== undefined
					) {
						return operation
					}
					const subjects = await state.resolveSubjects()
					// `resolveInput` recomputes the ACL of updates that carry none;
					// the kind check above narrows what TypeScript cannot.
					const recomputed = await recomputeUpdateOperationACL(
						operation as unknown as ACLPreparedUpdateOperation,
						target,
						option.config,
						subjects.principal,
						context,
						subjects.roleResolutionAvailable,
						option.limits,
						state.persistentRoleResolver,
					)
					return recomputed as unknown as TOperation
				}

			return {
				value: {
					transformInput,
					transformPreparedInput,
					transformResult: async (input) => {
						if (input.outcome === undefined) return input.result
						const option = state.protectedOption(input.operation)
						if (option === undefined) return input.result
						const kind = input.operation.kind.startsWith('create')
							? 'create'
							: input.operation.kind.startsWith('upsert')
								? 'upsert'
								: 'update'
						const changes = await state.collectACLChanges(
							input.context,
							option.schema,
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

	const instance: ACLPlugin = plugin({
		id: aclPluginId,
		version: '0.0.0',
		core: '^0.0.0',
		permissions: {
			'authority:elevate':
				'Maintains persisted ACL references through audited internal Master queries.',
		},
		contributions: [
			optionalRoleResolver,
			optionalACLChangedEvents,
			principalReferenceCleanupProvider,
			roleReferenceCleanupProvider,
			replacementShapeProvider,
			fieldPolicyProvider,
			inputProvider,
			referenceRowsProvider,
			rowsProvider,
			withPluginPrivileges(behaviorProvider, [
				'authority:elevate',
				'event:publish',
			]),
			aclDeclarations,
		],
	})
	// `acl: true` in define requires `plugins.acl({ default })` (ADR-0339).
	return provideSchemaRules<ACLPlugin>(
		provideSchemaFeatures<ACLPlugin, ACLFeatureSource>(instance, {
			acl: {
				sets: ['acl'],
				apply: () => ({ acl: aclFeatureDeclared }),
				requires: ['acl'],
			},
		}),
		['acl'],
	)
}
