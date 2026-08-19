import type { MaybePromise } from '@ultimabase/shared'

import type { ApplicationContributionOwner } from '../../application/application-handles.js'
import type {
	PluginOperationDefinition,
	PluginOperationInput,
	PluginOperationResult,
} from '../../plugins/plugin-operations.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'

/** Supplies a handler with the exact application-owned target selected by its handle. */
export type PluginOperationExecutionTarget =
	| Readonly<{ readonly kind: 'application' }>
	| Readonly<{ readonly kind: 'schema'; readonly schema: SchemaDefinition }>
	| Readonly<{
			readonly kind: 'model'
			readonly model: object
			readonly schema: SchemaDefinition
			readonly state: 'draft' | 'persisted'
	  }>

/** Carries one validated operation into its owner without protected Runtime state. */
export interface PluginOperationHandlerInput<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> {
	readonly context: RequestContext
	readonly engine: RequestEngine
	readonly input: PluginOperationInput<TOperation>
	readonly owner: ApplicationContributionOwner
	readonly target: PluginOperationExecutionTarget
}

/** Executes one exact declared operation through its active RequestEngine. */
export type PluginOperationHandler<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> = (
	input: PluginOperationHandlerInput<TOperation>,
) => MaybePromise<PluginOperationResult<TOperation>>

/** Identifies one handler while keeping its executable callback private. */
export interface PluginOperationHandlerDefinition<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
> {
	readonly kind: 'plugin-operation-handler'
	readonly operation: TOperation
}

/** Names one public transport protocol without coupling it to HTTP or GraphQL. */
export interface OperationTransportProtocol<
	TName extends string = string,
	TVersion extends string = string,
> {
	readonly kind: 'operation-transport-protocol'
	readonly name: TName
	readonly version: TVersion
}

/** Keeps wire conversion separate from logical operation validation. */
export interface OperationWireCodec<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
	TWireInput = unknown,
	TWireResult = unknown,
> {
	readonly kind: 'operation-wire-codec'
	readonly operation: TOperation
	readonly transport: TTransport
	/** Retains exact wire types without exposing the codec implementation. */
	readonly __types?: Readonly<{
		readonly input: TWireInput
		readonly result: TWireResult
	}>
}

/** Declares one operation's explicit opt-in to one compatible wire protocol. */
export interface OperationTransportBindingDefinition<
	TOperation extends PluginOperationDefinition = PluginOperationDefinition,
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
	TWireInput = unknown,
	TWireResult = unknown,
> {
	readonly codec: OperationWireCodec<
		TOperation,
		TTransport,
		TWireInput,
		TWireResult
	>
	readonly kind: 'operation-transport-binding'
	readonly operation: TOperation
	readonly transport: TTransport
}

/** Reads the logical input wire type retained by one binding. */
export type OperationTransportWireInput<TBinding> =
	TBinding extends OperationTransportBindingDefinition<
		PluginOperationDefinition,
		OperationTransportProtocol,
		infer TInput
	>
		? TInput
		: never

/** Reads the logical result wire type retained by one binding. */
export type OperationTransportWireResult<TBinding> =
	TBinding extends OperationTransportBindingDefinition<
		PluginOperationDefinition,
		OperationTransportProtocol,
		unknown,
		infer TResult
	>
		? TResult
		: never
