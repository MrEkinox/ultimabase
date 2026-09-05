import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'
import { valid } from 'semver'

import { isBuiltInField } from './kinds.js'
import { assertPluginFieldKind } from './kinds.js'
import {
	getBuiltInFieldOptionsContract,
	getFieldListDepth,
	isFieldNullable,
	isRequiredOnCreate,
	snapshotListedFieldValue,
	type BuiltInFieldOptionsContract,
} from './options.js'
import type {
	FieldScalarValue,
	FieldTypegenState,
	GenericField,
} from './contract.js'
import { snapshotJsonValue } from './portable-json.js'
import type { SchemaTarget } from '../../schema/targets.js'

export type ScalarValueSnapshot = (value: unknown, path: string) => unknown

/** Describes one adapter-neutral serialized scalar boundary owned by a plugin field. */
export interface PluginFieldStorageCodec<TValue = unknown> {
	/** Selects the portable representation adapters may opt into. */
	readonly format: 'json'
	/** Identifies the plugin-owned physical contract for migration planning. */
	readonly version: number
	/** Strictly restores one logical scalar from untrusted stored data. */
	readonly decode: (value: unknown) => TValue
	/** Produces one JSON-compatible physical value from a validated logical scalar. */
	readonly encode: (value: TValue) => unknown
}

/** Names one canonical plugin-field wire protocol without importing its transport. */
export interface PluginFieldWireProtocol<
	TName extends string = string,
	TVersion extends string = string,
> {
	readonly kind: 'plugin-field-wire-protocol'
	readonly name: TName
	readonly version: TVersion
}

const pluginFieldWireProtocolNamePattern =
	/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\.[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u
const pluginFieldWireProtocols = new Map<string, PluginFieldWireProtocol>()
const pluginFieldWireProtocolIdentities = new WeakSet<object>()

/**
 * Returns one process-canonical field protocol identity for an exact name and
 * version, so field owners can declare compatibility without importing a
 * concrete transport package.
 */
export const definePluginFieldWireProtocol = <
	const TName extends string,
	const TVersion extends string,
>(options: {
	readonly name: TName
	readonly version: TVersion
}): PluginFieldWireProtocol<TName, TVersion> => {
	if (!isPlainRecord(options)) {
		throw new TypeError(
			'Plugin field wire protocol options must be a plain object',
		)
	}
	if (
		typeof options.name !== 'string' ||
		!pluginFieldWireProtocolNamePattern.test(options.name)
	) {
		throw new TypeError('Plugin field wire protocol name must be namespaced')
	}
	if (valid(options.version) !== options.version) {
		throw new TypeError(
			'Plugin field wire protocol version must be exact SemVer',
		)
	}

	const key = `${options.name}\0${options.version}`
	const existing = pluginFieldWireProtocols.get(key)
	if (existing !== undefined) {
		return existing as PluginFieldWireProtocol<TName, TVersion>
	}
	const protocol = immutableRecord({
		kind: 'plugin-field-wire-protocol' as const,
		name: options.name,
		version: options.version,
	})
	pluginFieldWireProtocols.set(key, protocol)
	pluginFieldWireProtocolIdentities.add(protocol)
	return protocol
}

/** @internal Verifies protocol provenance before retaining a private codec. */
export const isPluginFieldWireProtocol = (
	value: unknown,
): value is PluginFieldWireProtocol =>
	typeof value === 'object' &&
	value !== null &&
	pluginFieldWireProtocolIdentities.has(value)

/** Describes one owner-attached JSON wire codec for an exact nominal protocol. */
export interface PluginFieldWireCodec<TValue = unknown> {
	readonly format: 'json'
	readonly protocol: PluginFieldWireProtocol
	/** Strictly restores one logical scalar from untrusted wire data. */
	readonly decode: (value: unknown) => TValue
	/** Produces one JSON-compatible wire value from a validated logical scalar. */
	readonly encode: (value: TValue) => unknown
}

/** Identifies the Core-owned portable containment protocol understood by adapters. */
export const pluginFieldStructuralContainsProtocolVersion = 1 as const

/** Inert metadata proving that one declared plugin field supports containment. */
export interface PluginFieldStructuralContainsMetadata {
	readonly format: 'json'
	readonly protocolVersion: typeof pluginFieldStructuralContainsProtocolVersion
}

interface PluginFieldStructuralContainsCapability {
	readonly metadata: PluginFieldStructuralContainsMetadata
	readonly snapshotOperand: (value: unknown, path: string) => unknown
}

interface FieldMetadata<TKind extends string, TOptions extends object> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
}

interface FieldCapabilities {
	readonly deferRequiredUntilResolveInput: boolean
	readonly optionsContract: BuiltInFieldOptionsContract | undefined
	readonly schemaTarget: SchemaTarget | undefined
	readonly snapshotValue: ScalarValueSnapshot
	readonly storageCodec: PluginFieldStorageCodec | undefined
	readonly wireCodecs: readonly PluginFieldWireCodec[]
	readonly structuralContains:
		PluginFieldStructuralContainsCapability | undefined
}

/** Carries non-metadata capabilities used only by specialized field factories. */
export interface FieldDefinitionCapabilities {
	/** Lets a plugin fill a required create value before structural revalidation. */
	readonly deferRequiredUntilResolveInput?: boolean
	readonly schemaTarget?: SchemaTarget
	/** Lets adapters persist one plugin scalar through a validated JSON representation. */
	readonly storageCodec?: PluginFieldStorageCodec
	/** Attaches exact transport codecs without exposing callbacks in field metadata. */
	readonly wireCodecs?: readonly PluginFieldWireCodec[]
	/** Keeps the author callback private while exposing only inert protocol metadata. */
	readonly structuralContains?: {
		readonly snapshotOperand: (value: unknown, path: string) => unknown
	}
	/** Records Core-owned root option names for specialized factories. */
	readonly optionsContract?: BuiltInFieldOptionsContract
}

// Weak ownership proves factory provenance without retaining application schemas.
const fieldCapabilities = new WeakMap<object, FieldCapabilities>()

/**
 * Creates every official field through one immutable, capability-aware boundary.
 */
export const createFieldDefinition = <
	const TKind extends string,
	const TOptions extends object,
>(
	kind: TKind,
	options: Readonly<TOptions>,
	snapshotValue: ScalarValueSnapshot,
	capabilities: FieldDefinitionCapabilities = {},
): FieldMetadata<TKind, TOptions> => {
	const field = immutableRecord({ kind, options })
	const structuralSnapshot = capabilities.structuralContains?.snapshotOperand
	const structuralContains =
		structuralSnapshot === undefined
			? undefined
			: immutableRecord({
					metadata: immutableRecord({
						format: 'json' as const,
						protocolVersion: pluginFieldStructuralContainsProtocolVersion,
					}),
					snapshotOperand: (value: unknown, path: string): unknown =>
						snapshotJsonValue(structuralSnapshot(value, path), path),
				})

	fieldCapabilities.set(
		field,
		immutableRecord({
			deferRequiredUntilResolveInput:
				capabilities.deferRequiredUntilResolveInput === true,
			optionsContract:
				capabilities.optionsContract ?? getBuiltInFieldOptionsContract(options),
			schemaTarget: capabilities.schemaTarget,
			snapshotValue,
			storageCodec: capabilities.storageCodec,
			wireCodecs: capabilities.wireCodecs ?? [],
			structuralContains,
		}),
	)

	return field
}

/** Reads built-in ownership without exposing private behavioral capabilities. */
export const getDeclaredFieldOptionsContract = (
	field: GenericField,
): BuiltInFieldOptionsContract | undefined =>
	fieldCapabilities.get(field)?.optionsContract

/** Rebuilds immutable field metadata while retaining its private factory capabilities. */
export const replaceDeclaredFieldOptions = (
	field: GenericField,
	options: Readonly<Record<string, unknown>>,
): GenericField => {
	const capabilities = fieldCapabilities.get(field)

	if (capabilities === undefined) {
		throw new TypeError('field must be created by a field factory')
	}

	const replacement = immutableRecord({ kind: field.kind, options })

	fieldCapabilities.set(replacement, capabilities)

	return replacement
}

/** Resolves one lazy schema target without placing its callback in field metadata. */
export const getFieldSchemaTarget = (
	field: GenericField,
): SchemaTarget | undefined => fieldCapabilities.get(field)?.schemaTarget

/** Resolves a plugin-owned serialized value boundary without exposing it as metadata. */
export const getPluginFieldStorageCodec = (
	field: GenericField,
): PluginFieldStorageCodec | undefined =>
	fieldCapabilities.get(field)?.storageCodec

/** Resolves an owner-attached codec only for the exact nominal protocol object. */
export const getPluginFieldWireCodec = (
	field: GenericField,
	protocol: PluginFieldWireProtocol,
): PluginFieldWireCodec | undefined =>
	fieldCapabilities
		.get(field)
		?.wireCodecs.find((codec) => codec.protocol === protocol)

/** Reads only the inert protocol marker; plugin callbacks never leave Core ownership. */
export const getPluginFieldStructuralContains = (
	field: GenericField,
): PluginFieldStructuralContainsMetadata | undefined =>
	fieldCapabilities.get(field)?.structuralContains?.metadata

/** Snapshots one plugin containment operand at the trusted query boundary. */
export const snapshotPluginFieldStructuralContainsOperand = (
	field: GenericField,
	value: unknown,
	path: string,
): unknown => {
	const capability = fieldCapabilities.get(field)?.structuralContains

	if (capability === undefined) {
		throw new TypeError(`${path} requires plugin field structural containment`)
	}

	return capability.snapshotOperand(value, path)
}

/** Distinguishes official factories from structurally forged field objects. */
export const isDeclaredFieldDefinition = (value: object): boolean =>
	fieldCapabilities.has(value)

/** Protects composition from malformed or structurally forged metadata. */
export function assertFieldDefinition(
	value: unknown,
	path: string,
): asserts value is GenericField {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	const { kind, options } = value

	if (typeof kind !== 'string' || !isPlainRecord(options)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	assertNonEmptyString(kind, `${path}.kind`)

	if (!isBuiltInField({ kind })) {
		assertPluginFieldKind(kind, `${path}.kind`)
	}

	if (!isDeclaredFieldDefinition(value)) {
		throw new TypeError(`${path} must be created by a field factory`)
	}
}

/** Applies one declared field's logical scalar capability without list wrapping. */
export function snapshotScalarFieldValue<TField extends GenericField>(
	field: TField,
	value: unknown,
	path: string,
): FieldScalarValue<TField>

export function snapshotScalarFieldValue(
	field: GenericField,
	value: unknown,
	path: string,
): unknown {
	const capabilities = fieldCapabilities.get(field)

	if (capabilities === undefined) {
		throw new TypeError(`${path} uses a field not created by a field factory`)
	}

	return capabilities.snapshotValue(value, path)
}

/** Reapplies one declared field's scalar and list contract at static boundaries. */
export const snapshotDeclaredFieldValue = (
	field: GenericField,
	value: unknown,
	path: string,
): unknown => {
	const capabilities = fieldCapabilities.get(field)

	if (capabilities === undefined) {
		throw new TypeError(`${path} uses a field not created by a field factory`)
	}

	return snapshotListedFieldValue(
		value,
		getFieldListDepth(field.options),
		capabilities.snapshotValue,
		path,
	)
}

/** Identifies required plugin fields whose value is supplied by input behavior. */
export const isFieldRequiredDeferred = (field: GenericField): boolean =>
	fieldCapabilities.get(field)?.deferRequiredUntilResolveInput === true

/**
 * Reads the compact runtime inference facts used by deterministic type generation.
 *
 * The factory-owned deferred-required capability is included here so generated
 * create inputs match the same validation plan enforced at Runtime.
 */
export const readFieldTypegenState = (
	field: GenericField,
): FieldTypegenState => {
	const generated = 'generatedOn' in field.options
	const relation = field.kind === 'relation'

	return immutableRecord({
		create: relation
			? 'forbidden'
			: generated
				? 'forbidden'
				: isFieldRequiredDeferred(field)
					? 'optional'
					: isRequiredOnCreate(field)
						? 'required'
						: 'optional',
		list: getFieldListDepth(field.options) > 0,
		nullable: relation ? false : isFieldNullable(field),
		object: relation ? 'forbidden' : 'required',
		update:
			relation ||
			generated ||
			('immutable' in field.options && field.options.immutable === true)
				? 'forbidden'
				: 'optional',
	})
}
