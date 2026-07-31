import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { isBuiltInField } from './kinds.js'
import { assertPluginFieldKind } from './kinds.js'
import { getFieldListDepth, snapshotListedFieldValue } from './options.js'
import type { FieldScalarValue, GenericField } from './contract.js'

export type ScalarValueSnapshot = (value: unknown, path: string) => unknown

interface FieldMetadata<TKind extends string, TOptions extends object> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
}

interface FieldCapabilities {
	readonly snapshotValue: ScalarValueSnapshot
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
): FieldMetadata<TKind, TOptions> => {
	const field = immutableRecord({ kind, options })

	fieldCapabilities.set(field, immutableRecord({ snapshotValue }))

	return field
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
