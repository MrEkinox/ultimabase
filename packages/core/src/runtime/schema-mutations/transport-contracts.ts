import type {
	PluginSchemaMutationDefinition,
	PluginSchemaMutationInput,
} from '../../plugins/plugin-schema-mutations.js'
import type { JsonValue } from '../../schema/index.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'

/** Converts one transport-owned payload into an exact logical mutation input. */
export interface SchemaMutationWireCodec<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
	TWireInput = unknown,
> {
	readonly kind: 'schema-mutation-wire-codec'
	readonly mutation: TMutation
	readonly transport: TTransport
	/** Retains wire inference without exposing the executable decoder. */
	readonly __types?: Readonly<{
		readonly input: TWireInput
		readonly logical: PluginSchemaMutationInput<TMutation>
	}>
}

/** Opts one exact schema mutation into one canonical transport protocol. */
export interface SchemaMutationTransportBindingDefinition<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
	TWireInput = unknown,
	TMetadata extends JsonValue = JsonValue,
> {
	readonly codec: SchemaMutationWireCodec<TMutation, TTransport, TWireInput>
	readonly kind: 'schema-mutation-transport-binding'
	/** Retains transport-specific inert facts without teaching Core their meaning. */
	readonly metadata: TMetadata
	readonly mutation: TMutation
	readonly transport: TTransport
}

/** Reads the wire payload retained by one schema-mutation binding. */
export type SchemaMutationTransportWireInput<TBinding> =
	TBinding extends SchemaMutationTransportBindingDefinition<
		PluginSchemaMutationDefinition,
		OperationTransportProtocol,
		infer TInput
	>
		? TInput
		: never

/** Reads the inert transport metadata retained by one binding. */
export type SchemaMutationTransportBindingMetadata<TBinding> =
	TBinding extends SchemaMutationTransportBindingDefinition<
		PluginSchemaMutationDefinition,
		OperationTransportProtocol,
		unknown,
		infer TMetadata
	>
		? TMetadata
		: never
