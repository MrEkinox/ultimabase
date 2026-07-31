import {
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaFields } from './definition.js'
import {
	reservedSystemFieldNames,
	type ReservedSystemFieldName,
} from './system-fields.js'

/**
 * Includes developer and framework-owned fields in top-level index declarations.
 */
export type SchemaFieldName<TFields extends object> =
	Extract<keyof TFields, string> | ReservedSystemFieldName

/**
 * Requires schema-level indexes to combine at least two fields.
 */
export interface SchemaIndexOptions<TFieldName extends string = string> {
	readonly fields: readonly [TFieldName, TFieldName, ...TFieldName[]]
	readonly unique?: boolean
}

/**
 * Normalizes field and schema declarations into one adapter-neutral contract.
 */
export interface SchemaIndexDefinition<TFieldName extends string = string> {
	readonly fields: readonly [TFieldName, ...TFieldName[]]
	readonly unique: boolean
}

const emptySchemaIndexes: readonly [] = immutableArray([])

function assertSchemaIndexes(
	indexes: unknown,
): asserts indexes is readonly SchemaIndexOptions[] | undefined {
	if (indexes === undefined) {
		return
	}

	if (!isUnknownArray(indexes)) {
		throw new TypeError('indexes must be a list')
	}

	for (const [indexPosition, index] of indexes.entries()) {
		const indexPath = `indexes[${String(indexPosition)}]`

		if (!isPlainRecord(index)) {
			throw new TypeError(`${indexPath} must be an object`)
		}

		if (!isUnknownArray(index.fields)) {
			throw new TypeError(`${indexPath}.fields must be a list`)
		}

		for (const [fieldPosition, fieldName] of index.fields.entries()) {
			if (typeof fieldName !== 'string') {
				throw new TypeError(
					`${indexPath}.fields[${String(fieldPosition)}] must be a string`,
				)
			}
		}

		assertOptionalBoolean(index.unique, `${indexPath}.unique`)
	}
}

const readFieldIndex = (options: object): boolean | 'unique' => {
	if (!('indexed' in options) || options.indexed === false) {
		return false
	}

	if (options.indexed === true || options.indexed === 'unique') {
		return options.indexed
	}

	throw new TypeError('indexed must be a boolean or "unique"')
}

const normalizeCompositeIndex = (
	index: SchemaIndexOptions,
	knownFieldNames: ReadonlySet<string>,
): SchemaIndexDefinition => {
	if (index.fields.length < 2) {
		throw new TypeError('Composite index must contain at least two fields')
	}

	const seenFieldNames = new Set<string>()

	for (const fieldName of index.fields) {
		if (!knownFieldNames.has(fieldName)) {
			throw new TypeError(`Unknown index field: ${fieldName}`)
		}

		if (seenFieldNames.has(fieldName)) {
			throw new TypeError(`Duplicate index field: ${fieldName}`)
		}

		seenFieldNames.add(fieldName)
	}

	return immutableRecord({
		fields: immutableArray(index.fields),
		unique: index.unique ?? false,
	})
}

/**
 * Collects field-level indexes first, then composite declarations in configuration order.
 */
export const normalizeSchemaIndexes = (
	fields: SchemaFields,
	indexes: readonly SchemaIndexOptions[] | undefined,
): readonly SchemaIndexDefinition[] => {
	assertSchemaIndexes(indexes)

	const definitions: SchemaIndexDefinition[] = []
	const knownFieldNames = new Set<string>([
		...Object.keys(fields),
		...reservedSystemFieldNames,
	])

	for (const [fieldName, field] of Object.entries(fields)) {
		const indexed = readFieldIndex(field.options)

		if (indexed !== false) {
			definitions.push(
				immutableRecord({
					fields: immutableArray([fieldName]),
					unique: indexed === 'unique',
				}),
			)
		}
	}

	for (const index of indexes ?? emptySchemaIndexes) {
		definitions.push(normalizeCompositeIndex(index, knownFieldNames))
	}

	return immutableArray(definitions)
}
