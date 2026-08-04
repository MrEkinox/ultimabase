import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { createFieldDefinition } from './base/definition.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from './base/kinds.js'
import {
	normalizeFieldOptions,
	normalizeFlatValidation,
} from './base/options.js'
import type {
	FieldDefinition,
	FieldInferenceState,
	FieldOptions,
	FieldValidationOptions,
	InvalidOptionsArguments,
	ResolveFieldInferenceState,
	ValidatedFieldOptions,
} from './base/contract.js'
import type { FieldHookDeclaration } from '../hooks/field-contracts.js'
import { splitFieldDeclarationOptions } from '../hooks/field-declarations.js'
import type { FieldAccessDeclaration } from '../access/contracts.js'
import type { PluginFieldStorageCodec } from './base/definition.js'

export type { ReservedFieldKind } from './base/kinds.js'

/** Removes declaration-only callbacks while retaining plugin-owned metadata. */
type PluginFieldMetadata<TOptions extends object> = Omit<
	TOptions,
	'access' | 'hooks'
>

/**
 * Carries a namespaced plugin kind while retaining the regular field contract.
 */
export type PluginFieldDefinition<
	TKind extends string = string,
	TValue = unknown,
	TOptions extends object = FieldOptions<TValue>,
	TInference extends FieldInferenceState = ResolveFieldInferenceState<TOptions>,
> = FieldDefinition<TKind, TValue, TOptions, TInference>

type DeferredPluginFieldInference<TOptions extends object> = Omit<
	ResolveFieldInferenceState<TOptions>,
	'create'
> & {
	readonly create: 'optional'
}

type PluginFieldInference<
	TOptions extends object,
	TDeferred extends boolean,
> = TDeferred extends true
	? DeferredPluginFieldInference<TOptions>
	: ResolveFieldInferenceState<TOptions>

/**
 * Lets a plugin normalize its own constraints and scalar values through Schema.
 */
export interface PluginFieldNormalizers<
	TValue,
	TValidation extends FieldValidationOptions,
	TDeferred extends boolean = false,
> {
	/** Defers one required create value until plugin resolveInput hooks have run. */
	readonly deferRequiredUntilResolveInput?: TDeferred
	readonly normalizeValidation?: (
		validation: TValidation,
	) => Readonly<TValidation>
	readonly snapshotValue: (value: unknown, path: string) => TValue
	/** Serializes one logical scalar through an adapter-neutral versioned JSON value. */
	readonly storageCodec?: PluginFieldStorageCodec<TValue>
}

const storageCodecKeys = new Set(['decode', 'encode', 'format', 'version'])

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
 * Creates a plugin-owned field while reusing common defaults, lists, and extensions.
 */
export const definePluginField = <
	TValue,
	const TKind extends string,
	TValidation extends FieldValidationOptions,
	const TOptions extends FieldOptions<TValue, TValidation>,
	const TDeferred extends boolean = false,
>(
	kind: AvailablePluginFieldKind<TKind>,
	options: TOptions &
		FieldHookDeclaration<
			PluginFieldDefinition<
				TKind,
				TValue,
				PluginFieldMetadata<NoInfer<TOptions>>
			>
		> &
		FieldAccessDeclaration<
			PluginFieldDefinition<
				TKind,
				TValue,
				PluginFieldMetadata<NoInfer<TOptions>>
			>
		>,
	normalizers: PluginFieldNormalizers<TValue, TValidation, TDeferred>,
	...invalidOptions: InvalidOptionsArguments<
		ValidatedFieldOptions<NoInfer<TOptions>, TValue>
	>
): PluginFieldDefinition<
	TKind,
	TValue,
	PluginFieldMetadata<TOptions>,
	PluginFieldInference<PluginFieldMetadata<TOptions>, TDeferred>
> => {
	// The rest parameter keeps invalid plugin metadata out of the public call contract.
	void invalidOptions
	assertPluginFieldKind(kind, 'Plugin field kind')

	if (
		!isPlainRecord(normalizers) ||
		typeof normalizers.snapshotValue !== 'function'
	) {
		throw new TypeError('Plugin field snapshotValue must be a function')
	}

	const storageCodec =
		normalizers.storageCodec === undefined
			? undefined
			: normalizePluginFieldStorageCodec(
					normalizers.storageCodec,
					normalizers.snapshotValue,
				)

	if (
		normalizers.normalizeValidation !== undefined &&
		typeof normalizers.normalizeValidation !== 'function'
	) {
		throw new TypeError(
			'Plugin field normalizeValidation must be a function when provided',
		)
	}
	const { access, hooks, metadataOptions } = splitFieldDeclarationOptions<
		PluginFieldMetadata<TOptions> & FieldOptions<TValue, TValidation>
	>(options)
	const normalizedOptions = normalizeFieldOptions(
		metadataOptions,
		normalizers.normalizeValidation ?? normalizeFlatValidation,
		normalizers.snapshotValue,
	)

	return createFieldDefinition(
		kind,
		normalizedOptions,
		normalizers.snapshotValue,
		hooks,
		access,
		{
			deferRequiredUntilResolveInput:
				normalizers.deferRequiredUntilResolveInput === true,
			...(storageCodec === undefined ? {} : { storageCodec }),
		},
	)
}
