import type { MaybePromise } from '@ultimabase/shared'

import type { PluginOperationHandler } from '../runtime/plugin-operations/contracts.js'
import type { OperationTransportBindingDefinition } from '../runtime/plugin-operations/contracts.js'
import type { PluginSchemaMutationHandler } from '../runtime/schema-mutations/contracts.js'
import type { SchemaMutationTransportBindingDefinition } from '../runtime/schema-mutations/transport-contracts.js'
import type { ApplicationCapabilityFactoryContext } from './capabilities.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { PluginSchemaMutationDefinition } from './plugin-schema-mutations.js'

export type PluginCommandSource =
	PluginOperationDefinition | PluginSchemaMutationDefinition

export type PluginCommandHandlerResource =
	| Readonly<{
			readonly dispose?: () => MaybePromise<void>
			readonly execute: PluginOperationHandler
			readonly kind: 'operation'
	  }>
	| Readonly<{
			readonly dispose?: () => MaybePromise<void>
			readonly kind: 'mutation'
			readonly resolve: PluginSchemaMutationHandler
	  }>

export interface PluginCommandHandlerPlan {
	readonly contributionId: string
	readonly create: (
		context: ApplicationCapabilityFactoryContext,
	) => MaybePromise<PluginCommandHandlerResource>
	readonly source: PluginCommandSource
}

export type PluginCommandTransportPlan =
	| Readonly<{
			readonly binding: OperationTransportBindingDefinition
			readonly contributionId: string
			readonly kind: 'operation'
			readonly source: PluginOperationDefinition
	  }>
	| Readonly<{
			readonly binding: SchemaMutationTransportBindingDefinition
			readonly contributionId: string
			readonly kind: 'mutation'
			readonly source: PluginSchemaMutationDefinition
	  }>

/** Core-native command facts compiled once from one plugin contribution list. */
export interface PluginCommandPlan {
	readonly declarations: readonly PluginCommandSource[]
	readonly handlers: readonly PluginCommandHandlerPlan[]
	readonly transports: readonly PluginCommandTransportPlan[]
}
