import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'

import {
	createFieldDefinition,
	isPluginFieldWireProtocol,
} from './base/definition.js'
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

type ValueSnapshot<TValue> = (value: unknown, path: string) => TValue

const storageCodecKeys = new Set(['decode', 'encode', 'format', 'version'])
const normalizerKeys = new Set([
	'deferRequiredUntilResolveInput',
	'snapshotValue',
	'storageCodec',
	'wireCodecs',
	'structuralContains',
])
const structuralContainsKeys = new Set(['snapshotOperand'])
const isCodecFunction = (
	value: unknown,
): value is (value: unknown) => unknown => typeof value === 'function'

/** Wraps each nominal wire codec in the field's scalar and JSON snapshot guards. */
const normalizePluginFieldWireCodecs = (
	codecs: unknown,
	snapshotValue: ValueSnapshot<unknown>,
): readonly PluginFieldWireCodec[] => {
	if (codecs === undefined) return []
	if (!isUnknownArray(codecs)) {
		throw new TypeError('Plugin field wireCodecs must be an array')
	}

	const protocols = new Set<object>()
	return Object.freeze(
		codecs.map((codec, index) => {
			const invalidCodec = new TypeError(
				`Plugin field wireCodecs[${String(index)}] must be a JSON codec`,
			)
			if (!isPlainRecord(codec)) throw invalidCodec
			const { decode, encode, protocol } = codec
			if (
				codec.format !== 'json' ||
				!isPluginFieldWireProtocol(protocol) ||
				!isCodecFunction(decode) ||
				!isCodecFunction(encode)
			) {
				throw invalidCodec
			}
			if (protocols.has(protocol)) {
				throw new TypeError('Plugin field wireCodecs must use unique protocols')
			}
			protocols.add(protocol)
			return immutableRecord({
				decode: (value: unknown): unknown =>
					snapshotValue(decode(value), 'Decoded plugin field wire value'),
				encode: (value: unknown): unknown =>
					snapshotJsonValue(
						encode(snapshotValue(value, 'Encoded plugin field wire value')),
						'Encoded plugin field wire representation',
					),
				format: 'json' as const,
				protocol,
			})
		}),
	)
}

/** Erases the logical generic only after wrapping both directions in its snapshot guard. */
const normalizePluginFieldStorageCodec = <TValue>(
	codec: PluginFieldStorageCodec<TValue>,
	snapshotValue: ValueSnapshot<TValue>,
): PluginFieldStorageCodec => {
	const candidate: unknown = codec

	if (!isPlainRecord(candidate)) {
		throw new TypeError('Plugin field storageCodec must be a plain object')
	}

	assertExactEnumerableKeys(
		candidate,
		storageCodecKeys,
		'Unknown plugin field storageCodec key: ',
	)

	const { decode, encode, format, version } = candidate

	if (format !== 'json') {
		throw new TypeError('Plugin field storageCodec format must be json')
	}

	if (
		typeof version !== 'number' ||
		!Number.isSafeInteger(version) ||
		version < 1
	) {
		throw new RangeError(
			'Plugin field storageCodec version must be a positive safe integer',
		)
	}

	if (typeof decode !== 'function' || typeof encode !== 'function') {
		throw new TypeError(
			'Plugin field storageCodec must provide decode and encode functions',
		)
	}

	// Methods keep their declared receiver, exactly as authors wrote them.
	return immutableRecord({
		decode: (value: unknown): unknown =>
			snapshotValue(codec.decode(value), 'Decoded plugin field value'),
		encode: (value: unknown): unknown =>
			codec.encode(snapshotValue(value, 'Encoded plugin field value')),
		format: 'json' as const,
		version,
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

	assertExactEnumerableKeys(
		normalizers,
		normalizerKeys,
		'Unknown plugin field normalizer key: ',
	)

	const { snapshotValue, structuralContains } = normalizers
	const storageCodec =
		normalizers.storageCodec === undefined
			? undefined
			: normalizePluginFieldStorageCodec(
					normalizers.storageCodec,
					snapshotValue,
				)
	const normalizedOptions = normalizeFieldOptions(options, snapshotValue)
	const wireCodecs = normalizePluginFieldWireCodecs(
		normalizers.wireCodecs,
		snapshotValue,
	)

	if (structuralContains !== undefined) {
		if (!isPlainRecord(structuralContains)) {
			throw new TypeError(
				'Plugin field structuralContains must be a plain object',
			)
		}

		assertExactEnumerableKeys(
			structuralContains,
			structuralContainsKeys,
			'Unknown plugin field structuralContains key: ',
		)

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

	return createFieldDefinition(kind, normalizedOptions, snapshotValue, {
		deferRequiredUntilResolveInput:
			normalizers.deferRequiredUntilResolveInput === true,
		wireCodecs,
		...(storageCodec === undefined ? {} : { storageCodec }),
		...(structuralContains === undefined ? {} : { structuralContains }),
	})
}
