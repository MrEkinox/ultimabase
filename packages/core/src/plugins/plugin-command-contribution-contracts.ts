import type { MaybePromise } from '@ultimabase/shared'

import type {
	OperationTransportBindingDefinition,
	PluginOperationHandler,
} from '../runtime/plugin-operations/contracts.js'
import type { PluginSchemaMutationHandler } from '../runtime/schema-mutations/contracts.js'
import type { SchemaMutationTransportBindingDefinition } from '../runtime/schema-mutations/transport-contracts.js'
import type { ApplicationCapabilityFactoryContext } from './capabilities.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

/** Owns one materialized operation handler and its deterministic cleanup. */
export interface PluginOperationHandlerResource<
	TOperation extends PluginOperationDefinition,
> {
	readonly dispose?: () => MaybePromise<void>
	readonly execute: PluginOperationHandler<TOperation>
}

interface PluginOperationContributionBase<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> {
	/** Selects the exact logical contract implemented by this contribution. */
	readonly operation: TOperation
	/** Adds nominal wire bindings without making the operation publicly exposed. */
	readonly bindings?: TBindings
}

/** Implements one operation directly without creating an application resource. */
export interface DirectPluginOperationContributionOptions<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> extends PluginOperationContributionBase<TOperation, TBindings> {
	readonly create?: never
	readonly execute: PluginOperationHandler<TOperation>
}

/** Creates one application-local operation handler and optional cleanup. */
export interface ResourcePluginOperationContributionOptions<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> extends PluginOperationContributionBase<TOperation, TBindings> {
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginOperationHandlerResource<TOperation>>
	readonly execute?: never
}

export type PluginOperationContributionOptions<
	TOperation extends PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[],
> =
	| DirectPluginOperationContributionOptions<TOperation, TBindings>
	| ResourcePluginOperationContributionOptions<TOperation, TBindings>

declare const operationContributionType: unique symbol

/** Correlates one owned operation with its handler and optional wire bindings. */
export interface PluginOperationContribution<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
	TBindings extends readonly OperationTransportBindingDefinition<TOperation>[] =
		readonly OperationTransportBindingDefinition<TOperation>[],
> {
	readonly kind: 'plugin-operation-contribution'
	readonly operation: TOperation
	readonly bindings: TBindings
	readonly [operationContributionType]?: Readonly<{
		readonly operation: TOperation
		readonly bindings: TBindings
	}>
}

export interface PluginOperationBindingContribution<
	TBinding extends OperationTransportBindingDefinition =
		OperationTransportBindingDefinition,
> {
	readonly kind: 'plugin-operation-binding-contribution'
	readonly binding: TBinding
}

/** Owns one materialized schema-mutation resolver and its cleanup. */
export interface PluginSchemaMutationResource<
	TMutation extends PluginSchemaMutationDefinition,
> {
	readonly dispose?: () => MaybePromise<void>
	readonly resolve: PluginSchemaMutationHandler<TMutation>
}

interface PluginSchemaMutationContributionBase<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> {
	/** Selects the exact logical mutation implemented by this contribution. */
	readonly mutation: TMutation
	/** Adds nominal wire bindings without making the mutation publicly exposed. */
	readonly bindings?: TBindings
}

/** Implements one schema mutation without creating an application resource. */
export interface DirectPluginSchemaMutationContributionOptions<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> extends PluginSchemaMutationContributionBase<TMutation, TBindings> {
	readonly create?: never
	readonly resolve: PluginSchemaMutationHandler<TMutation>
}

/** Creates one application-local schema-mutation resolver and cleanup. */
export interface ResourcePluginSchemaMutationContributionOptions<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> extends PluginSchemaMutationContributionBase<TMutation, TBindings> {
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginSchemaMutationResource<TMutation>>
	readonly resolve?: never
}

export type PluginSchemaMutationContributionOptions<
	TMutation extends PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> =
	| DirectPluginSchemaMutationContributionOptions<TMutation, TBindings>
	| ResourcePluginSchemaMutationContributionOptions<TMutation, TBindings>

declare const schemaMutationContributionType: unique symbol

/** Correlates one owned schema mutation with its resolver and wire bindings. */
export interface PluginSchemaMutationContribution<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
	TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[] =
		readonly SchemaMutationTransportBindingDefinition<TMutation>[],
> {
	readonly kind: 'plugin-schema-mutation-contribution'
	readonly mutation: TMutation
	readonly bindings: TBindings
	readonly [schemaMutationContributionType]?: Readonly<{
		readonly mutation: TMutation
		readonly bindings: TBindings
	}>
}

export type PluginOperationAuthoringContribution =
	| PluginOperationContribution
	| PluginOperationBindingContribution
	| PluginSchemaMutationContribution
