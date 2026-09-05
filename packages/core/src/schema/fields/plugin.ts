import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { createFieldDefinition } from './base/definition.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from './base/kinds.js'
import { getFieldListDepth, normalizeFieldOptions } from './base/options.js'
import type {
	FieldDefinition,
	FieldTypegenState,
	FieldOptions,
	ResolveFieldTypegenState,
	ValidatedFieldOptions,
} from './base/contract.js'
import type {
	PluginFieldStorageCodec,
	PluginFieldWireCodec,
} from './base/definition.js'
import { snapshotJsonValue } from './base/portable-json.js'

export type {
	AvailablePluginFieldKind,
	ReservedFieldKind,
} from './base/kinds.js'

/** Retains plugin-owned and installed option metadata for application compilation. */
type PluginFieldMetadata<TOptions extends object> = TOptions

/**
 * Carries a namespaced plugin kind while retaining the regular field contract.
 */
export type PluginFieldDefinition<
	TKind extends string = string,
	TValue = unknown,
	TOptions extends object = FieldOptions<TValue>,
	TTypegen extends FieldTypegenState = ResolveFieldTypegenState<TOptions>,
	TStructuralContainsOperand = never,
> = FieldDefinition<
	TKind,
	TValue,
	TOptions,
	TTypegen,
	TStructuralContainsOperand
>

type DeferredPluginFieldTypegen<TOptions extends object> = Omit<
	ResolveFieldTypegenState<TOptions>,
	'create'
> & {
	readonly create: 'optional'
}

type PluginFieldTypegen<
	TOptions extends object,
	TDeferred extends boolean,
> = TDeferred extends true
	? DeferredPluginFieldTypegen<TOptions>
	: ResolveFieldTypegenState<TOptions>

type PluginFieldContainmentOperand<TCapability> = TCapability extends {
	readonly snapshotOperand: (value: unknown, path: string) => infer TOperand
}
	? TOperand
	: never

/**
 * Lets a plugin normalize its own constraints and scalar values through Schema.
 */
export interface PluginFieldNormalizers<
	TValue,
	TDeferred extends boolean = false,
	TStructuralContainsOperand = never,
> {
	/** Defers one required create value until plugin input behavior has run. */
	readonly deferRequiredUntilResolveInput?: TDeferred
	readonly snapshotValue: (value: unknown, path: string) => TValue
	/** Serializes one logical scalar through an adapter-neutral versioned JSON value. */
	readonly storageCodec?: PluginFieldStorageCodec<TValue>
	/** Attaches owner-defined codecs for exact nominal transport protocols. */
	readonly wireCodecs?: readonly PluginFieldWireCodec<TValue>[]
	/** Enables a portable partial JSON containment operand for non-list fields. */
	readonly structuralContains?: PluginFieldStructuralContains<TStructuralContainsOperand>
}

/** Defines the field owner's exact partial operand snapshot at the Query boundary. */
export interface PluginFieldStructuralContains<TOperand> {
	readonly snapshotOperand: (value: unknown, path: string) => TOperand
}

const storageCodecKeys = new Set(['decode', 'encode', 'format', 'version'])
const normalizerKeys = new Set([
	'deferRequiredUntilResolveInput',
	'snapshotValue',
	'storageCodec',
	'wireCodecs',
	'structuralContains',
])
const structuralContainsKeys = new Set(['snapshotOperand'])
const isWireCodecFunction = (
	value: unknown,
): value is (value: unknown) => unknown => typeof value === 'function'

const normalizePluginFieldWireCodecs = <TValue>(
	codecs: readonly PluginFieldWireCodec<TValue>[] | undefined,
	snapshotValue: (value: unknown, path: string) => TValue,
): readonly PluginFieldWireCodec[] => {
	if (codecs === undefined) return []
	const candidate: unknown = codecs
	if (!isUnknownArray(candidate)) {
		throw new TypeError('Plugin field wireCodecs must be an array')
	}

	const protocols = new Set<object>()
	return Object.freeze(
		candidate.map((codec, index) => {
			if (!isPlainRecord(codec)) {
				throw new TypeError(
					`Plugin field wireCodecs[${String(index)}] must be a JSON codec`,
				)
			}
			const decode: unknown = codec.decode
			const encode: unknown = codec.encode
			if (
				codec.format !== 'json' ||
				!isPlainRecord(codec.protocol) ||
				!isWireCodecFunction(decode) ||
				!isWireCodecFunction(encode)
			) {
				throw new TypeError(
					`Plugin field wireCodecs[${String(index)}] must be a JSON codec`,
				)
			}
			if (protocols.has(codec.protocol)) {
				throw new TypeError('Plugin field wireCodecs must use unique protocols')
			}
			protocols.add(codec.protocol)
			return immutableRecord({
				decode: (value: unknown): unknown =>
					snapshotValue(decode(value), 'Decoded plugin field wire value'),
				encode: (value: unknown): unknown =>
					snapshotJsonValue(
						encode(snapshotValue(value, 'Encoded plugin field wire value')),
						'Encoded plugin field wire representation',
					),
				format: 'json' as const,
				protocol: codec.protocol,
			})
		}),
	)
}

/** Erases the logical generic only after wrapping both directions in its snapshot guard. */
const normalizePluginFieldStorageCodec = <TValue>(
	codec: PluginFieldStorageCodec<TValue>,
	snapshotValue: (value: unknown, path: string) => TValue,
): PluginFieldStorageCodec => {
	const candidate: unknown = codec

	if (!isPlainRecord(candidate)) {
		throw new TypeError('Plugin field storageCodec must be a plain object')
	}

	const unknownKey = Object.keys(candidate).find(
		(key) => !storageCodecKeys.has(key),
	)

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown plugin field storageCodec key: ${unknownKey}`)
	}

	if (candidate.format !== 'json') {
		throw new TypeError('Plugin field storageCodec format must be json')
	}

	if (
		typeof candidate.version !== 'number' ||
		!Number.isSafeInteger(candidate.version) ||
		candidate.version < 1
	) {
		throw new RangeError(
			'Plugin field storageCodec version must be a positive safe integer',
		)
	}

	if (
		typeof candidate.decode !== 'function' ||
		typeof candidate.encode !== 'function'
	) {
		throw new TypeError(
			'Plugin field storageCodec must provide decode and encode functions',
		)
	}

	return immutableRecord({
		decode: (value: unknown): unknown =>
			snapshotValue(codec.decode(value), 'Decoded plugin field value'),
		encode: (value: unknown): unknown =>
			codec.encode(snapshotValue(value, 'Encoded plugin field value')),
		format: 'json' as const,
		version: candidate.version,
	})
}

/**
 * Creates a plugin-owned field while reusing common defaults and lists.
 */
export const definePluginField = <
	TValue,
	const TKind extends string,
	const TOptions extends FieldOptions<TValue>,
	const TDeferred extends boolean = false,
	const TStructuralContains extends
		PluginFieldStructuralContains<unknown> | undefined = undefined,
>(
	kind: AvailablePluginFieldKind<TKind>,
	options: TOptions & ValidatedFieldOptions<NoInfer<TOptions>, TValue>,
	normalizers: Omit<
		PluginFieldNormalizers<TValue, TDeferred, unknown>,
		'structuralContains'
	> & { readonly structuralContains?: TStructuralContains },
): PluginFieldDefinition<
	TKind,
	TValue,
	PluginFieldMetadata<TOptions>,
	PluginFieldTypegen<PluginFieldMetadata<TOptions>, TDeferred>,
	PluginFieldContainmentOperand<TStructuralContains>
> => {
	assertPluginFieldKind(kind, 'Plugin field kind')

	if (
		!isPlainRecord(normalizers) ||
		typeof normalizers.snapshotValue !== 'function'
	) {
		throw new TypeError('Plugin field snapshotValue must be a function')
	}

	const unknownNormalizerKey = Object.keys(normalizers).find(
		(key) => !normalizerKeys.has(key),
	)

	if (unknownNormalizerKey !== undefined) {
		throw new TypeError(
			`Unknown plugin field normalizer key: ${unknownNormalizerKey}`,
		)
	}

	const storageCodec =
		normalizers.storageCodec === undefined
			? undefined
			: normalizePluginFieldStorageCodec(
					normalizers.storageCodec,
					normalizers.snapshotValue,
				)

	const normalizedOptions = normalizeFieldOptions(
		options,
		normalizers.snapshotValue,
	)
	const wireCodecs = normalizePluginFieldWireCodecs(
		normalizers.wireCodecs,
		normalizers.snapshotValue,
	)
	const structuralContains = normalizers.structuralContains

	if (structuralContains !== undefined) {
		if (!isPlainRecord(structuralContains)) {
			throw new TypeError(
				'Plugin field structuralContains must be a plain object',
			)
		}

		const unknownStructuralKey = Object.keys(structuralContains).find(
			(key) => !structuralContainsKeys.has(key),
		)

		if (unknownStructuralKey !== undefined) {
			throw new TypeError(
				`Unknown plugin field structuralContains key: ${unknownStructuralKey}`,
			)
		}

		if (typeof structuralContains.snapshotOperand !== 'function') {
			throw new TypeError(
				'Plugin field structuralContains snapshotOperand must be a function',
			)
		}

		if (storageCodec === undefined) {
			throw new TypeError(
				'Plugin field structuralContains requires a JSON storageCodec',
			)
		}

		if (getFieldListDepth(normalizedOptions) > 0) {
			throw new TypeError(
				'Plugin field structuralContains does not support list fields',
			)
		}
	}

	return createFieldDefinition(
		kind,
		normalizedOptions,
		normalizers.snapshotValue,
		{
			deferRequiredUntilResolveInput:
				normalizers.deferRequiredUntilResolveInput === true,
			...(storageCodec === undefined ? {} : { storageCodec }),
			...(wireCodecs.length === 0 ? {} : { wireCodecs }),
			...(structuralContains === undefined ? {} : { structuralContains }),
		},
	)
}
