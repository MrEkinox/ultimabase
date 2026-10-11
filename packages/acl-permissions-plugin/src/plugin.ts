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
	type RuntimeOperationStageInput,
	type RuntimeOperationTransformStage,
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
	type PluginSchemaOptionSource,
	type PluginSchemaPatchSource,
	type PluginSchemaRulesSource,
	type PluginSchemaShapeSource,
	type SchemaRulesHKT,
	type SchemaSelection,
	type SchemaShapeMethod,
	provideSchemaShapeMethods,
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
	readProtectedSchemaOptions,
	type ACLDefaultFactory,
	type ACLInputResolver,
	type ACLSchemaLimits,
} from './acl-option.js'
import type { ACL } from './acl.js'
import {
	resolveCreateOperationACL,
	resolvePreparedOperationACL,
	type ACLCreateOperation,
} from './acl-operation-resolution.js'
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

export {
	resolveCreateOperationACL,
	resolvePreparedOperationACL,
} from './acl-operation-resolution.js'

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
/** Values an ACL default sees: the persisted developer fields, without the ACL. */
type ACLRuleData<TSchema> = TSchema extends SchemaDefinition
	? Omit<
			SchemaItem<TSchema>,
			typeof aclFieldName | 'createdAt' | 'id' | 'updatedAt'
		>
	: Readonly<Record<string, unknown>>

/** Entry of `.with({ ... })` owned by ACL, for one schema. */
export interface ACLRules<TSchema> {
	/**
	 * Supplies the default ACL, optionally derived from the created values.
	 * Call `.acl()` before `.with(...)` to add the `acl` field.
	 * @example `acl: { default: ({ data }) => new ACL().grantPublic('read') }`
	 */
	readonly acl?: {
		readonly default?: ACL | ACLDefaultFactory<ACLRuleData<TSchema>>
		readonly resolveInput?: ACLInputResolver<ACLRuleData<TSchema>>
		readonly limits?: ACLSchemaLimits
	}
}

/** Contributes `acl` to `.with({ ... })` through Core's rules slot (ADR-0297). */
export interface ACLSchemaRules extends SchemaRulesHKT {
	readonly rules: ACLRules<this['schema']>
}

/** Shape method chained before `.with(...)`: `.acl()` adds the `acl` field. */
export type ACLShapeSource = PluginSchemaShapeSource<{
	/**
	 * Adds the ACL field; configure its default in `.with({ acl })`.
	 * @example `App.Schema.define({ className: 'Todo', fields }).acl().with({})`
	 */
	readonly acl: SchemaShapeMethod<readonly [], Readonly<{ acl: object }>>
}>

type ACLSource =
	| ACLOptionSource
	| ACLFieldSource
	| PluginSchemaRulesSource<ACLSchemaRules>
	| ACLShapeSource

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
					if (state.protectedOption(operation) !== undefined) {
						assertSingularACLReplacement(operation)
					}
				},
				operations: aclReplacementInvariantOperationKinds,
			}),
	)
	const fieldPolicyProvider = stateConstraint('acl-protected-field', (state) =>
		createACLFieldPolicy(state.protectedOption),
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

			return {
				value: {
					transformInput,
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
	return provideSchemaShapeMethods<ACLPlugin, ACLShapeSource>(instance, {
		acl: { sets: ['acl'], apply: () => ({ acl: {} }) },
	})
}
