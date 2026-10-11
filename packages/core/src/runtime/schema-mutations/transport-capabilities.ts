import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
	type PluginSchemaMutationInput,
} from '../../plugins/plugin-schema-mutations.js'
import {
	snapshotJsonValue,
	type JsonValue,
} from '../../schema/fields/builtins/json.js'
import { isOperationTransportProtocol } from '../plugin-operations/capabilities.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type {
	SchemaMutationTransportBindingDefinition,
	SchemaMutationWireCodec,
} from './transport-contracts.js'

// Only nominal codecs minted by schemaMutationWireCodec carry a decoder.
const codecImplementations = new WeakMap<
	object,
	Readonly<{ decode(value: unknown): unknown }>
>()
const bindings = new WeakSet<object>()

/** Defines one owner-private payload decoder without exposing a schema result codec. */
export const schemaMutationWireCodec = <
	const TMutation extends PluginSchemaMutationDefinition,
	const TTransport extends OperationTransportProtocol,
	TWireInput,
>(options: {
	readonly mutation: TMutation
	readonly transport: TTransport
	decode(value: TWireInput): PluginSchemaMutationInput<TMutation>
}): SchemaMutationWireCodec<TMutation, TTransport, TWireInput> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'schema mutation wire codec options must be a plain object',
		)
	}
	if (!isPluginSchemaMutationDefinition(options.mutation)) {
		throw new TypeError('schema mutation wire codec requires a mutation token')
	}
	if (!isOperationTransportProtocol(options.transport)) {
		throw new TypeError(
			'schema mutation wire codec requires a transport protocol',
		)
	}
	if (typeof options.decode !== 'function') {
		throw new TypeError('schema mutation wire codec requires a decode function')
	}
	const codec = immutableRecord({
		kind: 'schema-mutation-wire-codec' as const,
		mutation: options.mutation,
		transport: options.transport,
	})
	codecImplementations.set(codec, {
		decode: (value) => options.decode(value as TWireInput),
	})
	return codec
}

/** Binds one exact mutation payload codec to a canonical transport. */
export const schemaMutationTransportBinding = <
	const TMutation extends PluginSchemaMutationDefinition,
	const TTransport extends OperationTransportProtocol,
	TWireInput,
	const TMetadata extends JsonValue = null,
>(options: {
	readonly codec: SchemaMutationWireCodec<TMutation, TTransport, TWireInput>
	readonly metadata?: TMetadata
	readonly mutation: TMutation
}): SchemaMutationTransportBindingDefinition<
	TMutation,
	TTransport,
	TWireInput,
	TMetadata
> => {
	if (!isPlainRecord(options) || !codecImplementations.has(options.codec)) {
		throw new TypeError(
			'schema mutation transport binding requires a wire codec',
		)
	}
	if (options.codec.mutation !== options.mutation) {
		throw new TypeError(
			'schema mutation transport binding codec targets another mutation',
		)
	}
	// Transports address one row by identifier; `where` inputs come with
	// commands that take input data (ADR-0316, out of scope).
	if (options.mutation.target === 'many') {
		throw new TypeError(
			'many-row schema mutations cannot be bound to a transport yet',
		)
	}
	const binding = immutableRecord({
		codec: options.codec,
		kind: 'schema-mutation-transport-binding' as const,
		metadata: snapshotJsonValue(
			options.metadata ?? null,
			'schema mutation transport binding metadata',
		) as TMetadata,
		mutation: options.mutation,
		transport: options.codec.transport,
	})
	bindings.add(binding)
	return binding
}

/** @internal Reads one decoder only from a nominal codec definition. */
export const getSchemaMutationWireCodec = (
	codec: unknown,
): Readonly<{ decode(value: unknown): unknown }> | undefined =>
	typeof codec === 'object' && codec !== null
		? codecImplementations.get(codec)
		: undefined

/** @internal Narrows bindings created by the public factory. */
export const isSchemaMutationTransportBinding = (
	value: unknown,
): value is SchemaMutationTransportBindingDefinition =>
	typeof value === 'object' && value !== null && bindings.has(value)
