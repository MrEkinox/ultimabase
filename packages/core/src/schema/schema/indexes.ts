import {
	assertOptionalBoolean,
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaFields } from './definition.js'
import {
	assertSchemaIndexConditions,
	normalizeSchemaIndexWhere,
	type SchemaIndexCondition,
	type SchemaIndexWhere,
} from './index-predicates.js'
import type { FieldTypeStateOf, GenericField } from '../fields/base/contract.js'
import { systemFields, type ReservedSystemFieldName } from './system-fields.js'
import { assertPlainObject } from '../../exact-object-validation.js'

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
					? FieldTypeStateOf<TFields[TFieldName]>['object'] extends 'forbidden'
						? never
						: TFieldName
					: never
			}[keyof TFields & string]

export type SchemaFieldName<TFields extends object> =
	IndexableDeclaredFieldName<TFields> | ReservedSystemFieldName

/**
 * Declares one schema-level index of `define`. Its `where` sees only the
 * framework-owned system fields; partial indexes over the complete shape are
 * declared in the final `.with` (ADR-0303).
 */
export interface SchemaIndexOptions<TFieldName extends string = string> {
	/**
	 * Lists one or more distinct top-level fields in index-column order.
	 * Developer fields and framework-owned system fields are accepted; a plain
	 * single-field index is better declared on the field with `indexed`.
	 *
	 * @example `fields: ["authorId", "createdAt"]`
	 */
	readonly fields: readonly [TFieldName, ...TFieldName[]]
	/**
	 * Requests uniqueness across the complete field combination, among the rows
	 * `where` matches. Defaults to `false`.
	 *
	 * @example `unique: true`
	 */
	readonly unique?: boolean
	/**
	 * Restricts the index to matching rows: equality, `gt`, `gte`, `lt`, `lte`,
	 * null tests and `AND` on scalar non-list fields, with literal values.
	 *
	 * @example `where: { createdAt: { gte: '2026-01-01T00:00:00.000Z' } }`
	 */
	readonly where?: SchemaIndexWhere<Readonly<Record<never, never>>>
}

/**
 * Declares one index in the final `.with`, optionally partial: its `where`
 * sees the complete schema shape, plugin shape fields included (ADR-0303).
 */
export interface SchemaRuleIndexOptions<
	TFieldName extends string,
	TWhere extends object,
> {
	/**
	 * Lists one or more distinct top-level fields in index-column order.
	 *
	 * @example `fields: ['slug']`
	 */
	readonly fields: readonly [TFieldName, ...TFieldName[]]
	/**
	 * Requests uniqueness among the rows `where` matches. Defaults to `false`.
	 *
	 * @example `unique: true`
	 */
	readonly unique?: boolean
	/**
	 * Restricts the index to matching rows: equality (a literal or `eq`), `gt`,
	 * `gte`, `lt`, `lte`, null tests and `AND` on scalar non-list fields.
	 *
	 * @example `where: { isDeleted: false }`
	 */
	readonly where?: TWhere
}

/** The runtime shape of one declared index before validation. */
export type SchemaIndexInput = Readonly<{
	fields: readonly string[]
	unique?: boolean
	where?: unknown
}>

/**
 * Normalizes field and schema declarations into one adapter-neutral contract.
 */
export interface SchemaIndexDefinition<TFieldName extends string = string> {
	/** The normalized non-empty field sequence consumed by adapters. */
	readonly fields: readonly [TFieldName, ...TFieldName[]]
	/** Whether the complete field combination must be unique. */
	readonly unique: boolean
	/** The conjunction restricting a partial index; absent for a full index. */
	readonly where?: readonly SchemaIndexCondition[]
}

/**
 * The indexes that are unique targets (ADR-0332 amendment): the unique index
 * of a field declared `indexed: 'unique'` and each unique index of `define`
 * without `where`. Unique indexes of `.with`, partial ones and those a plugin
 * patch adds stay storage indexes. Tracked by identity, so the index shape
 * adapters read is unchanged.
 */
const uniqueTargetIndexes = new WeakSet<SchemaIndexDefinition>()

/** Whether one normalized index identifies a row for unique commands. */
export const isUniqueTargetIndex = (index: SchemaIndexDefinition): boolean =>
	uniqueTargetIndexes.has(index)

/** @internal Creates the index of one field declared `indexed`. */
export const createFieldIndex = (
	fieldName: string,
	indexed: true | 'unique',
): SchemaIndexDefinition => {
	const index: SchemaIndexDefinition = immutableRecord({
		fields: immutableArray([fieldName]),
		unique: indexed === 'unique',
	})
	if (indexed === 'unique') uniqueTargetIndexes.add(index)
	return index
}

function assertSchemaIndexes(
	indexes: unknown,
): asserts indexes is readonly SchemaIndexInput[] | undefined {
	if (indexes === undefined) {
		return
	}

	if (!isUnknownArray(indexes)) {
		throw new TypeError('indexes must be a list')
	}

	for (const [indexPosition, index] of indexes.entries()) {
		const indexPath = `indexes[${String(indexPosition)}]`

		assertPlainObject(index, `${indexPath} must be an object`)

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
		if (index.where !== undefined) {
			normalizeSchemaIndexWhere(index.where, `${indexPath}.where`)
		}
	}
}

/** Snapshots composite declarations before deferred schema fields resolve. */
export const snapshotSchemaIndexOptions = (
	indexes: readonly SchemaIndexInput[] | undefined,
): readonly SchemaIndexInput[] | undefined => {
	assertSchemaIndexes(indexes)

	if (indexes === undefined) {
		return undefined
	}

	return immutableArray(
		indexes.map((index) =>
			immutableRecord({
				fields: immutableArray(index.fields),
				...(index.unique === undefined ? {} : { unique: index.unique }),
				...(index.where === undefined
					? {}
					: { where: structuredClone(index.where) }),
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

const normalizeCompositeIndex = (
	index: SchemaIndexInput,
	knownFields: Readonly<Record<string, GenericField>>,
	path: string,
	allowPending: boolean,
): SchemaIndexDefinition => {
	if (index.fields.length < 1) {
		throw new TypeError('Index must contain at least one field')
	}

	const seenFieldNames = new Set<string>()

	for (const fieldName of index.fields) {
		if (!allowPending && !Object.hasOwn(knownFields, fieldName)) {
			throw new TypeError(`Unknown index field: ${fieldName}`)
		}

		if (seenFieldNames.has(fieldName)) {
			throw new TypeError(`Duplicate index field: ${fieldName}`)
		}

		seenFieldNames.add(fieldName)
	}

	const where =
		index.where === undefined
			? undefined
			: normalizeSchemaIndexWhere(index.where, `${path}.where`)
	if (where !== undefined) {
		assertSchemaIndexConditions(
			allowPending
				? where.filter(({ field }) => Object.hasOwn(knownFields, field))
				: where,
			knownFields,
			`${path}.where`,
		)
	}

	const [first, ...rest] = index.fields
	if (first === undefined) {
		throw new TypeError('Index must contain at least one field')
	}

	return immutableRecord({
		fields: immutableArray([first, ...rest]),
		unique: index.unique ?? false,
		...(where === undefined ? {} : { where }),
	})
}

/** Indexable fields: persisted non-relation fields plus system fields. */
const readIndexableFields = (
	fields: Readonly<Record<string, GenericField>>,
): Readonly<Record<string, GenericField>> =>
	Object.fromEntries([
		...Object.entries(fields).filter(([, field]) => field.kind !== 'relation'),
		...Object.entries(systemFields),
	])

const isSameIndex = (
	left: SchemaIndexDefinition,
	right: SchemaIndexDefinition,
): boolean =>
	left.unique === right.unique &&
	left.where === undefined &&
	right.where === undefined &&
	left.fields.length === right.fields.length &&
	left.fields.every((field, position) => right.fields[position] === field)

/**
 * Collects field-level indexes first, then schema-level declarations in
 * configuration order. Indexes declared in the final `.with` (`ruleIndexes`),
 * and those of a `define` that sets feature keys (`featureIndexes`), may name
 * fields that installed plugins add later; the compiled application checks
 * them with `assertCompiledSchemaIndexes`. A complete unique index of
 * `define` is a unique target even when it names feature fields; a partial
 * one, or one of `.with`, is storage only (ADR-0332 amendment, ADR-0339).
 */
export const normalizeSchemaIndexes = (
	fields: SchemaFields,
	indexes: readonly SchemaIndexInput[] | undefined,
	ruleIndexes: readonly SchemaIndexInput[] = [],
	featureIndexes = false,
): readonly SchemaIndexDefinition[] => {
	assertSchemaIndexes(indexes)
	assertSchemaIndexes(ruleIndexes)

	const definitions: SchemaIndexDefinition[] = []
	const knownFields = readIndexableFields(fields)

	for (const [fieldName, field] of Object.entries(fields)) {
		const indexed = readFieldIndexValue(Reflect.get(field.options, 'indexed'))

		if (indexed !== false) {
			definitions.push(createFieldIndex(fieldName, indexed))
		}
	}
	const fieldLevel = definitions.length

	const declared = [
		...(indexes ?? []).map((index) => ({
			index,
			pending: featureIndexes,
			target: true,
		})),
		...ruleIndexes.map((index) => ({ index, pending: true, target: false })),
	]
	for (const [position, { index, pending, target }] of declared.entries()) {
		const definition = normalizeCompositeIndex(
			index,
			knownFields,
			`indexes[${String(position)}]`,
			pending,
		)
		if (
			definitions
				.slice(0, fieldLevel)
				.some((existing) => isSameIndex(existing, definition))
		) {
			throw new TypeError(
				`Index duplicates the field-level index of ${definition.fields[0]}`,
			)
		}
		if (target && definition.unique && definition.where === undefined) {
			uniqueTargetIndexes.add(definition)
		}
		definitions.push(definition)
	}

	return immutableArray(definitions)
}

/** Normalizes one plugin-contributed index against a schema's current fields. */
export const normalizePatchSchemaIndex = (
	index: SchemaIndexInput,
	persistedFields: Readonly<Record<string, GenericField>>,
): SchemaIndexDefinition => {
	assertSchemaIndexes([index])
	return normalizeCompositeIndex(
		index,
		readIndexableFields(persistedFields),
		'index',
		false,
	)
}

/** Checks every index of one compiled schema against its final fields (ADR-0303). */
export const assertCompiledSchemaIndexes = (
	className: string,
	indexes: readonly SchemaIndexDefinition[],
	persistedFields: Readonly<Record<string, GenericField>>,
): void => {
	const knownFields = readIndexableFields(persistedFields)
	for (const [position, index] of indexes.entries()) {
		for (const fieldName of index.fields) {
			if (!Object.hasOwn(knownFields, fieldName)) {
				throw new TypeError(`Unknown index field: ${className}.${fieldName}`)
			}
		}
		if (index.where !== undefined) {
			assertSchemaIndexConditions(
				index.where,
				knownFields,
				`${className}.indexes[${String(position)}].where`,
			)
		}
	}
}
