import { FrameworkError } from '../../foundation.js'
import { getFieldSchemaTarget, Schema } from '../../schema/index.js'
import type { SchemaDefinition, SchemaStoredData } from '../../schema/index.js'
import { createPointer, Pointer } from '../../schema/relations/pointer.js'
import type { LinkTargetMarker } from '../../schema/nested-writes/operation-markers.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/** Collection-command data whose `connect` links became stored Pointers. */
export interface CollectionLinkData<TData> {
	readonly data: SchemaStoredData<TData>
	readonly links: readonly LinkTargetMarker[]
}

const invalidLink = (path: string, problem: string): FrameworkError =>
	new FrameworkError('VALIDATION_ERROR', `${path} ${problem}`, {
		publicMessage: 'The operation input is invalid.',
	})

const readLinkTarget = (
	value: unknown,
	target: SchemaDefinition,
	path: string,
): Pointer => {
	if (Pointer.is(value)) {
		if (value.schema !== target) {
			throw invalidLink(
				path,
				`must be a ${target.className} Pointer or object ID`,
			)
		}
		return value
	}
	if (typeof value !== 'string' || value.length === 0) {
		throw invalidLink(path, 'must be a non-empty object ID or Pointer')
	}
	return createPointer(target, value)
}

/**
 * Converts the pointer links of one collection-command data object (ADR-0308):
 * `{ connect: target }` becomes the stored Pointer and is retained for the
 * visibility check, `null` unlinks; a raw Pointer or id is rejected. Nested
 * `create` and `update` stay unavailable on collection commands (ADR-0243).
 */
export const normalizeCollectionLinks = <TData>(
	schema: SchemaDefinition,
	data: TData,
	path: string,
): CollectionLinkData<TData> => {
	// Core validation rejects a non-object row after this pass.
	if (!isPlainRecord(data)) {
		return immutableRecord({ data: data as SchemaStoredData<TData>, links: [] })
	}

	const links: LinkTargetMarker[] = []
	let converted: [string, unknown][] | undefined

	for (const [field, value] of Object.entries(data)) {
		const definition = Object.hasOwn(schema.persistedFields, field)
			? schema.persistedFields[field]
			: undefined
		if (definition?.kind !== 'pointer' || value === null) continue

		const fieldPath = `${path}.${field}`
		if (Pointer.is(value) || !isPlainRecord(value)) {
			throw invalidLink(
				fieldPath,
				'must be a link command such as { connect: id }',
			)
		}
		const keys = Object.keys(value)
		if (keys.length !== 1 || keys[0] !== 'connect') {
			throw invalidLink(
				fieldPath,
				'accepts only { connect: id } or null in collection commands',
			)
		}
		const target = getFieldSchemaTarget(definition)?.()
		if (!Schema.is(target)) {
			throw new TypeError(`${fieldPath} requires a registered pointer target`)
		}
		const pointer = readLinkTarget(
			value.connect,
			target,
			`${fieldPath}.connect`,
		)
		links.push(immutableRecord({ field, pointer }))
		converted ??= Object.entries(data)
		converted = converted.map(([name, item]) =>
			name === field ? [name, pointer] : [name, item],
		)
	}

	// Every link above became its Pointer; entries keep `__proto__` as an own key.
	const stored = (
		converted === undefined
			? data
			: immutableRecord(Object.fromEntries(converted))
	) as SchemaStoredData<TData>

	return immutableRecord({ data: stored, links: immutableArray(links) })
}
