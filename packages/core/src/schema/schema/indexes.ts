import {
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaFields } from './definition.js'
import type {
	FieldTypegenStateOf,
	GenericField,
} from '../fields/base/contract.js'
import {
	reservedSystemFieldNames,
	type ReservedSystemFieldName,
} from './system-fields.js'

/**
 * Includes developer and framework-owned fields in top-level index declarations.
 */
type IndexableDeclaredFieldName<TFields extends object> =
	string extends keyof TFields
		? string
		: {
				[
					TFieldName in keyof TFields & string
				]: TFields[TFieldName] extends GenericField
					? FieldTypegenStateOf<
							TFields[TFieldName]
						>['object'] extends 'forbidden'
						? never
						: TFieldName
					: never
			}[keyof TFields & string]

export type SchemaFieldName<TFields extends object> =
	IndexableDeclaredFieldName<TFields> | ReservedSystemFieldName

/**
 * Requires schema-level indexes to combine at least two fields.
 */
export interface SchemaIndexOptions<TFieldName extends string = string> {
	/**
	 * Lists at least two distinct top-level fields in index-column order.
	 * Developer fields and framework-owned system fields are accepted.
	 *
	 * @example `fields: ["authorId", "createdAt"]`
	 */
	readonly fields: readonly [TFieldName, TFieldName, ...TFieldName[]]
	/**
	 * Requests uniqueness across the complete field combination. Defaults to `false`.
	 *
	 * @example `unique: true`
	 */
	readonly unique?: boolean
}

/**
 * Normalizes field and schema declarations into one adapter-neutral contract.
 */
export interface SchemaIndexDefinition<TFieldName extends string = string> {
	/** The normalized non-empty field sequence consumed by adapters. */
	readonly fields: readonly [TFieldName, ...TFieldName[]]
	/** Whether the complete field combination must be unique. */
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

/** Snapshots composite declarations before deferred schema fields resolve. */
export const snapshotSchemaIndexOptions = (
	indexes: readonly SchemaIndexOptions[] | undefined,
): readonly SchemaIndexOptions[] | undefined => {
	assertSchemaIndexes(indexes)

	if (indexes === undefined) {
		return undefined
	}

	return immutableArray(
		indexes.map((index) =>
			immutableRecord({
				fields: immutableArray(index.fields),
				...(index.unique === undefined ? {} : { unique: index.unique }),
			}),
		),
	)
}

/** @internal Resolves one normalized field-level index option. */
export const readFieldIndexValue = (value: unknown): boolean | 'unique' => {
	if (value === undefined || value === false) {
		return false
	}

	if (value === true || value === 'unique') {
		return value
	}

	throw new TypeError('indexed must be a boolean or "unique"')
}

/** @internal Resolves the implicit index carried by one field options contract. */
export const readFieldIndex = (options: object): boolean | 'unique' =>
	readFieldIndexValue('indexed' in options ? options.indexed : undefined)

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

/** Validates one plugin-contributed composite index against the transformed fields. */
export const normalizeContributedSchemaIndex = (
	fields: SchemaFields,
	index: SchemaIndexOptions,
): SchemaIndexDefinition =>
	normalizeCompositeIndex(
		index,
		new Set([
			...Object.entries(fields)
				.filter(([, field]) => field.kind !== 'relation')
				.map(([fieldName]) => fieldName),
			...reservedSystemFieldNames,
		]),
	)

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
		...Object.entries(fields)
			.filter(([, field]) => field.kind !== 'relation')
			.map(([fieldName]) => fieldName),
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
