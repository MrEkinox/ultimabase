import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'
import { valid } from 'semver'

import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
	type PluginOperationInput,
	type PluginOperationResult,
} from '../../plugins/plugin-operations.js'
import {
	snapshotJsonValue,
	type JsonValue,
} from '../../schema/fields/builtins/json.js'
import type {
	OperationTransportBindingDefinition,
	OperationTransportProtocol,
	OperationWireCodec,
} from './contracts.js'

const namespacedNamePattern =
	/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u
const wireCodecImplementations = new WeakMap<
	object,
	Readonly<{
		decode(value: unknown): unknown
		encode(value: unknown): MaybePromise<unknown>
	}>
>()
const transportProtocols = new Map<string, OperationTransportProtocol>()
const transportProtocolIdentities = new WeakSet<object>()
const transportBindings = new WeakSet<object>()

/** Creates one nominal public transport protocol identity. */
export const defineOperationTransport = <
	const TName extends string,
	const TVersion extends string,
>(options: {
	readonly name: TName
	readonly version: TVersion
}): OperationTransportProtocol<TName, TVersion> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('operation transport options must be a plain object')
	}
	if (
		typeof options.name !== 'string' ||
		!namespacedNamePattern.test(options.name)
	) {
		throw new TypeError('operation transport name must be namespaced')
	}
	if (valid(options.version) !== options.version) {
		throw new TypeError('operation transport version must be exact SemVer')
	}
	const key = `${options.name}\0${options.version}`
	const existing = transportProtocols.get(key)
	if (existing !== undefined) {
		return existing as OperationTransportProtocol<TName, TVersion>
	}
	const transport = immutableRecord({
		kind: 'operation-transport-protocol' as const,
		name: options.name,
		version: options.version,
	})
	transportProtocols.set(key, transport)
	transportProtocolIdentities.add(transport)
	return transport
}

/** Defines one logical-to-wire codec without making the operation public. */
export const operationWireCodec = <
	const TOperation extends PluginOperationDefinition,
	const TTransport extends OperationTransportProtocol,
	TWireInput,
	TWireResult,
>(options: {
	readonly operation: TOperation
	readonly transport: TTransport
	decode(value: TWireInput): PluginOperationInput<TOperation>
	encode(value: PluginOperationResult<TOperation>): MaybePromise<TWireResult>
}): OperationWireCodec<TOperation, TTransport, TWireInput, TWireResult> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('operation wire codec options must be a plain object')
	}
	if (!isPluginOperationDefinition(options.operation)) {
		throw new TypeError('operation wire codec requires an operation token')
	}
	if (!transportProtocolIdentities.has(options.transport)) {
		throw new TypeError('operation wire codec requires a transport protocol')
	}
	if (
		typeof options.decode !== 'function' ||
		typeof options.encode !== 'function'
	) {
		throw new TypeError(
			'operation wire codec requires decode and encode functions',
		)
	}
	const codec = immutableRecord({
		kind: 'operation-wire-codec' as const,
		operation: options.operation,
		transport: options.transport,
	})
	wireCodecImplementations.set(codec, {
		decode: (value) => options.decode(value as TWireInput),
		encode: (value) =>
			options.encode(value as PluginOperationResult<TOperation>),
	})
	return codec
}

/** Binds one compatible codec to an operation under explicit transport exposure. */
export const operationTransportBinding = <
	const TOperation extends PluginOperationDefinition,
	const TTransport extends OperationTransportProtocol,
	TWireInput,
	TWireResult,
	const TMetadata extends JsonValue = null,
>(options: {
	readonly operation: TOperation
	readonly codec: OperationWireCodec<
		TOperation,
		TTransport,
		TWireInput,
		TWireResult
	>
	readonly metadata?: TMetadata
}): OperationTransportBindingDefinition<
	TOperation,
	TTransport,
	TWireInput,
	TWireResult,
	TMetadata
> => {
	if (
		!isPlainRecord(options) ||
		wireCodecImplementations.get(options.codec) === undefined
	) {
		throw new TypeError('operation transport binding requires a wire codec')
	}
	if (options.codec.operation !== options.operation) {
		throw new TypeError(
			'operation transport binding codec targets another operation',
		)
	}
	const binding = immutableRecord({
		codec: options.codec,
		kind: 'operation-transport-binding' as const,
		metadata: snapshotJsonValue(
			options.metadata ?? null,
			'operation transport binding metadata',
		) as TMetadata,
		operation: options.operation,
		transport: options.codec.transport,
	})
	transportBindings.add(binding)
	return binding
}

export const getOperationWireCodec = (
	codec: unknown,
):
	| Readonly<{
			decode(value: unknown): unknown
			encode(value: unknown): MaybePromise<unknown>
	  }>
	| undefined =>
	typeof codec === 'object' && codec !== null
		? wireCodecImplementations.get(codec)
		: undefined

export const isOperationTransportProtocol = (
	value: unknown,
): value is OperationTransportProtocol =>
	typeof value === 'object' &&
	value !== null &&
	transportProtocolIdentities.has(value)

export const isOperationTransportBinding = (
	value: unknown,
): value is OperationTransportBindingDefinition =>
	typeof value === 'object' && value !== null && transportBindings.has(value)
