import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { isBuiltInField } from './kinds.js'
import { assertPluginFieldKind } from './kinds.js'
import { getFieldListDepth, snapshotListedFieldValue } from './options.js'
import type { FieldScalarValue, GenericField } from './contract.js'
import type { FieldHookDeclarations } from '../../hooks/field-declarations.js'
import type { FieldAccessDeclarations } from '../../access/field-declarations.js'
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

interface FieldMetadata<TKind extends string, TOptions extends object> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
}

interface FieldCapabilities {
	readonly access: FieldAccessDeclarations | undefined
	readonly deferRequiredUntilResolveInput: boolean
	readonly hooks: FieldHookDeclarations | undefined
	readonly schemaTarget: SchemaTarget | undefined
	readonly snapshotValue: ScalarValueSnapshot
	readonly storageCodec: PluginFieldStorageCodec | undefined
}

/** Carries non-metadata capabilities used only by specialized field factories. */
export interface FieldDefinitionCapabilities {
	/** Lets a plugin fill a required create value before structural revalidation. */
	readonly deferRequiredUntilResolveInput?: boolean
	readonly schemaTarget?: SchemaTarget
	/** Lets adapters persist one plugin scalar through a validated JSON representation. */
	readonly storageCodec?: PluginFieldStorageCodec
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
	hooks?: FieldHookDeclarations,
	access?: FieldAccessDeclarations,
	capabilities: FieldDefinitionCapabilities = {},
): FieldMetadata<TKind, TOptions> => {
	const field = immutableRecord({ kind, options })

	fieldCapabilities.set(
		field,
		immutableRecord({
			access,
			deferRequiredUntilResolveInput:
				capabilities.deferRequiredUntilResolveInput === true,
			hooks,
			schemaTarget: capabilities.schemaTarget,
			snapshotValue,
			storageCodec: capabilities.storageCodec,
		}),
	)

	return field
}

/** Resolves declaration-only callbacks for Core Runtime without public metadata leaks. */
export const getFieldHookDeclarations = (
	field: GenericField,
): FieldHookDeclarations | undefined => fieldCapabilities.get(field)?.hooks

/** Resolves private Access rules without exposing them as physical metadata. */
export const getFieldAccessDeclarations = (
	field: GenericField,
): FieldAccessDeclarations | undefined => fieldCapabilities.get(field)?.access

/** Resolves one lazy schema target without placing its callback in field metadata. */
export const getFieldSchemaTarget = (
	field: GenericField,
): SchemaTarget | undefined => fieldCapabilities.get(field)?.schemaTarget

/** Resolves a plugin-owned serialized value boundary without exposing it as metadata. */
export const getPluginFieldStorageCodec = (
	field: GenericField,
): PluginFieldStorageCodec | undefined =>
	fieldCapabilities.get(field)?.storageCodec

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

/** Identifies required plugin fields whose value is supplied by resolveInput hooks. */
export const isFieldRequiredDeferred = (field: GenericField): boolean =>
	fieldCapabilities.get(field)?.deferRequiredUntilResolveInput === true
