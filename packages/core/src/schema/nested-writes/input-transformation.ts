import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import { getFieldSchemaTarget } from '../fields/base/definition.js'
import type { SchemaDefinition } from '../schema/definition.js'

/** Describes one transport-owned field value before nested target traversal. */
export interface SchemaMutationDataFieldInput {
	readonly field: GenericField | undefined
	readonly kind: 'persisted' | 'unknown' | 'virtual'
	readonly mode: 'create' | 'update'
	/**
	 * Location of the value in the data, for transport error details:
	 * `['title']`, `['comments', 'create', 0, 'body']`.
	 */
	readonly path: readonly (number | string)[]
	readonly relationships: 'flat' | 'nested'
	readonly value: unknown
}

/** Configures one immutable transport mutation-data traversal. */
export interface SchemaMutationDataTransformOptions {
	readonly mode: 'create' | 'update'
	readonly relationships: 'flat' | 'nested'
	readonly transformField: (input: SchemaMutationDataFieldInput) => unknown
}

const transformNestedData = (
	field: GenericField,
	value: unknown,
	options: SchemaMutationDataTransformOptions,
	path: readonly (number | string)[],
): unknown => {
	if (!isPlainRecord(value)) return value
	const target = getFieldSchemaTarget(field)?.()
	if (target === undefined) return value
	const transformed: Record<string, unknown> = { ...value }
	const nested = (
		data: unknown,
		mode: 'create' | 'update',
		at: readonly (number | string)[],
	): unknown =>
		transformData(
			target,
			data,
			{
				mode,
				relationships: 'nested',
				transformField: options.transformField,
			},
			[...path, ...at],
		)

	if (field.kind === 'pointer') {
		if (Object.hasOwn(value, 'create')) {
			transformed.create = nested(value.create, 'create', ['create'])
		}
		if (options.mode === 'update' && Object.hasOwn(value, 'update')) {
			transformed.update = nested(value.update, 'update', ['update'])
		}
	} else {
		if (isUnknownArray(value.create)) {
			transformed.create = immutableArray(
				value.create.map((item, index) =>
					nested(item, 'create', ['create', index]),
				),
			)
		}
		if (isUnknownArray(value.update)) {
			transformed.update = immutableArray(
				value.update.map((item, index) =>
					isPlainRecord(item) && Object.hasOwn(item, 'data')
						? immutableRecord({
								...item,
								data: nested(item.data, 'update', ['update', index, 'data']),
							})
						: item,
				),
			)
		}
	}
	return immutableRecord(transformed)
}

/**
 * Traverses schema mutation data while delegating every transport wire value.
 * The callback retains validation, identities, codecs, and public errors.
 */
export const transformSchemaMutationDataInput = (
	schema: SchemaDefinition,
	value: unknown,
	options: SchemaMutationDataTransformOptions,
): unknown => transformData(schema, value, options, [])

const transformData = (
	schema: SchemaDefinition,
	value: unknown,
	options: SchemaMutationDataTransformOptions,
	path: readonly (number | string)[],
): unknown => {
	if (!isPlainRecord(value)) return value
	// Entries keep every input name, including `__proto__`, as an own key.
	const transformed: [string, unknown][] = []

	for (const [name, item] of Object.entries(value)) {
		// Inherited `Object.prototype` members are never persisted fields.
		const field: GenericField | undefined = Object.hasOwn(
			schema.persistedFields,
			name,
		)
			? schema.persistedFields[name]
			: undefined
		const decoded = options.transformField({
			field,
			kind:
				field === undefined
					? Object.hasOwn(schema.virtualFields, name)
						? 'virtual'
						: 'unknown'
					: 'persisted',
			mode: options.mode,
			path: immutableArray([...path, name]),
			relationships: options.relationships,
			value: item,
		})
		transformed.push([
			name,
			options.relationships === 'nested' &&
			field !== undefined &&
			(field.kind === 'pointer' || field.kind === 'relation')
				? transformNestedData(field, decoded, options, [...path, name])
				: decoded,
		])
	}
	return immutableRecord(Object.fromEntries(transformed))
}
