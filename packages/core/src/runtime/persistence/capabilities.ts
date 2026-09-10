import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import {
	defineCapability,
	provideCapability,
	type ApplicationCapabilityFactory,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import type {
	ExecutableOperationAst,
	OperationKind,
} from '../../query/index.js'
import type { PluginSchemaMutationOperationAst } from '../schema-mutations/contracts.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type {
	DatabasePersistencePlan,
	DatabasePersistenceRewriteInput,
	PersistenceLogicalOperationAst,
} from './contracts.js'

/** Describes one targeted physical-plan rewriter without exposing its callback. */
export interface PersistencePlanRewriterDefinition {
	readonly operations: readonly PersistencePlanOperationKind[]
	readonly schema: SchemaDefinition | undefined
}

/** Lists logical operation kinds that may own a physical persistence plan. */
export type PersistencePlanOperationKind =
	OperationKind | 'plugin-schema-mutation'

type RewriterLogicalOperation<
	TSchema extends SchemaDefinition,
	TOperations extends readonly PersistencePlanOperationKind[],
> =
	| Extract<
			ExecutableOperationAst<TSchema>,
			{ readonly kind: TOperations[number] }
	  >
	| ('plugin-schema-mutation' extends TOperations[number]
			? PluginSchemaMutationOperationAst
			: never)

type RewriterPhysicalOperation<TLogicalOperation> =
	TLogicalOperation extends DatabaseOperationAst
		? TLogicalOperation
		: DatabaseOperationAst

type PersistencePlanRewriteHandler<
	TLogicalOperation extends PersistenceLogicalOperationAst =
		PersistenceLogicalOperationAst,
	TPhysicalOperation extends DatabaseOperationAst = DatabaseOperationAst,
> = (
	input: DatabasePersistenceRewriteInput<TLogicalOperation, TPhysicalOperation>,
) => MaybePromise<DatabasePersistencePlan<TPhysicalOperation>>

const persistencePlanRewriteHandlers = new WeakMap<
	object,
	PersistencePlanRewriteHandler
>()
const persistencePlanRewriterProviders = new WeakSet<object>()

/** Creates one targeted rewriter whose callback never receives protected constraints. */
export const persistencePlanRewriter = <
	const TOperations extends readonly [
		PersistencePlanOperationKind,
		...PersistencePlanOperationKind[],
	],
	const TSchema extends SchemaDefinition = SchemaDefinition,
>(options: {
	readonly operations: TOperations
	readonly schema?: TSchema
	readonly rewrite: PersistencePlanRewriteHandler<
		RewriterLogicalOperation<TSchema, TOperations>,
		RewriterPhysicalOperation<RewriterLogicalOperation<TSchema, TOperations>>
	>
}): PersistencePlanRewriterDefinition => {
	const definition = immutableRecord({
		operations: immutableArray(options.operations),
		...(options.schema === undefined ? {} : { schema: options.schema }),
	}) as PersistencePlanRewriterDefinition

	persistencePlanRewriteHandlers.set(
		definition,
		options.rewrite as unknown as PersistencePlanRewriteHandler,
	)
	return definition
}

/** Composes independent plan rewriters in deterministic plugin graph order. */
export const persistencePlanRewriterCapability: CapabilityToken<
	PersistencePlanRewriterDefinition,
	readonly PersistencePlanRewriterDefinition[],
	'ultimabase.persistence-plan-rewriters',
	'1.0.0',
	'multiple',
	'application'
> = defineCapability<
	PersistencePlanRewriterDefinition,
	readonly PersistencePlanRewriterDefinition[]
>()({
	capabilityId: 'ultimabase.persistence-plan-rewriters',
	version: '1.0.0',
	cardinality: 'multiple',
	lifetime: 'application',
	compose: (providers) => immutableArray(providers),
})

/** Provides one rewriter through the exact `persistence:rewrite` facade. */
export const providePersistencePlanRewriter = <
	const TDefinition extends PersistencePlanRewriterDefinition,
>(
	options: Readonly<{
		contributionId: string
		create: ApplicationCapabilityFactory<TDefinition>
	}>,
): CapabilityProviderDeclaration<typeof persistencePlanRewriterCapability> => {
	const declaration = provideCapability(
		persistencePlanRewriterCapability,
		options,
	)
	persistencePlanRewriterProviders.add(declaration)
	return declaration
}

/** Reads one trusted callback after its materialized definition is validated. */
export const getPersistencePlanRewriteHandler = (
	definition: unknown,
): PersistencePlanRewriteHandler | undefined =>
	typeof definition === 'object' && definition !== null
		? persistencePlanRewriteHandlers.get(definition)
		: undefined

/** Rejects generic capability providers that bypass the exact rewrite facade. */
export const isAuthorizedPersistencePlanRewriterProvider = (
	declaration: CapabilityProviderDeclaration,
): boolean => persistencePlanRewriterProviders.has(declaration)
