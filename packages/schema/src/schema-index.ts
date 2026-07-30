import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaFields } from './schema.js'
import {
	reservedSystemFieldNames,
	type ReservedSystemFieldName,
} from './system-field.js'

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

const readFieldIndex = (
	fieldName: string,
	options: object,
): boolean | 'unique' => {
	if (!('indexed' in options) || options.indexed === false) {
		return false
	}

	if (options.indexed === true || options.indexed === 'unique') {
		return options.indexed
	}

	throw new TypeError(`Invalid indexed option for field: ${fieldName}`)
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

	if (index.unique !== undefined && typeof index.unique !== 'boolean') {
		throw new TypeError('Index unique must be a boolean')
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
	const definitions: SchemaIndexDefinition[] = []
	const knownFieldNames = new Set<string>([
		...Object.keys(fields),
		...reservedSystemFieldNames,
	])

	for (const [fieldName, field] of Object.entries(fields)) {
		const indexed = readFieldIndex(fieldName, field.options)

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
