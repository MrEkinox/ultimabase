import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	FieldList,
	FieldScalarValue,
	FieldTypegenStateOf,
	GenericField,
} from '../fields/base/contract.js'
import { hasListOption } from '../fields/base/options.js'
import type { SystemFields } from './system-fields.js'

/** Kinds a partial-index predicate may compare (ADR-0303). */
const comparableKinds = new Set([
	'bigint',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'string',
	'time',
	'uuid',
])

/** Kinds that also accept `gt`, `gte`, `lt` and `lte`. */
const orderedKinds = new Set([
	'bigint',
	'date',
	'dateTime',
	'decimal',
	'float',
	'int',
	'string',
	'time',
])

type ComparableKind =
	| 'bigint'
	| 'boolean'
	| 'date'
	| 'dateTime'
	| 'decimal'
	| 'enum'
	| 'float'
	| 'int'
	| 'string'
	| 'time'
	| 'uuid'

type OrderedKind =
	| 'bigint'
	| 'date'
	| 'dateTime'
	| 'decimal'
	| 'float'
	| 'int'
	| 'string'
	| 'time'

type NullTest = Readonly<{ isNull?: true; isNotNull?: true }>

type IndexFieldCondition<TField> = TField extends GenericField
	? FieldTypegenStateOf<TField>['list'] extends FieldList
		? never
		: TField['kind'] extends ComparableKind
			? | NonNullable<FieldScalarValue<TField>>
				| null
				| (NullTest &
						Readonly<
							{
								eq?: NonNullable<FieldScalarValue<TField>>
							} & (TField['kind'] extends OrderedKind
								? {
										gt?: NonNullable<FieldScalarValue<TField>>
										gte?: NonNullable<FieldScalarValue<TField>>
										lt?: NonNullable<FieldScalarValue<TField>>
										lte?: NonNullable<FieldScalarValue<TField>>
									}
								: unknown)
						>)
			: TField['kind'] extends 'pointer'
				? null | NullTest
				: never
	: never

/**
 * The portable `where` of a partial index (ADR-0303): equality (shorthand or
 * `eq`), `gt`, `gte`, `lt`, `lte` on scalar non-list fields, null tests
 * (`null`, `isNull`, `isNotNull`) and conjunction (`AND`, or several keys).
 *
 * @example `where: { isDeleted: false }`
 */
export type SchemaIndexWhere<TFields extends object> =
	string extends keyof TFields
		? UntypedSchemaIndexWhere
		: TypedSchemaIndexWhere<TFields>

/** The where of an index whose fields are not statically known. */
type UntypedSchemaIndexCondition =
	| SchemaIndexLiteral
	| null
	| readonly UntypedSchemaIndexWhere[]
	| (NullTest &
			Readonly<{
				eq?: SchemaIndexLiteral
				gt?: SchemaIndexLiteral
				gte?: SchemaIndexLiteral
				lt?: SchemaIndexLiteral
				lte?: SchemaIndexLiteral
			}>)

type UntypedSchemaIndexWhere = Readonly<
	Record<string, UntypedSchemaIndexCondition>
>

type TypedSchemaIndexWhere<TFields extends object> = Readonly<
	{
		readonly [
			TName in keyof (TFields & SystemFields) & string as [
				IndexFieldCondition<(TFields & SystemFields)[TName]>,
			] extends [never]
				? never
				: TName
		]?: IndexFieldCondition<(TFields & SystemFields)[TName]>
	} & { readonly AND?: readonly TypedSchemaIndexWhere<TFields>[] }
>

/** A literal compared by a partial-index predicate. */
export type SchemaIndexLiteral = bigint | boolean | number | string

/** One normalized partial-index condition; an index's conditions form a conjunction. */
export type SchemaIndexCondition =
	| Readonly<{
			kind:
				| 'equal'
				| 'greater-than'
				| 'greater-than-or-equal'
				| 'less-than'
				| 'less-than-or-equal'
			field: string
			value: SchemaIndexLiteral
	  }>
	| Readonly<{ kind: 'null'; field: string; isNull: boolean }>

const comparisonKinds: Readonly<
	Record<string, Exclude<SchemaIndexCondition['kind'], 'null'>>
> = {
	eq: 'equal',
	gt: 'greater-than',
	gte: 'greater-than-or-equal',
	lt: 'less-than',
	lte: 'less-than-or-equal',
}

const isLiteral = (value: unknown): value is SchemaIndexLiteral =>
	typeof value === 'string' ||
	typeof value === 'boolean' ||
	typeof value === 'bigint' ||
	(typeof value === 'number' && Number.isFinite(value))

const readComparison = (
	field: string,
	operator: string,
	operand: unknown,
	path: string,
): SchemaIndexCondition => {
	if (operator === 'isNull' || operator === 'isNotNull') {
		if (operand !== true)
			throw new TypeError(`${path}.${operator} must be true`)
		return immutableRecord({
			kind: 'null',
			field,
			isNull: operator === 'isNull',
		})
	}
	const kind = Object.hasOwn(comparisonKinds, operator)
		? comparisonKinds[operator]
		: undefined
	if (kind === undefined) {
		throw new TypeError(
			`${path}.${operator} is not a portable partial-index operator`,
		)
	}
	if (!isLiteral(operand)) {
		throw new TypeError(`${path}.${operator} must be a literal value`)
	}
	return immutableRecord({ kind, field, value: operand })
}

/** Flattens one static `where` into its conjunction of conditions. */
export const normalizeSchemaIndexWhere = (
	where: unknown,
	path: string,
): readonly SchemaIndexCondition[] => {
	if (!isPlainRecord(where)) throw new TypeError(`${path} must be an object`)
	const conditions: SchemaIndexCondition[] = []
	for (const [key, value] of Object.entries(where)) {
		if (key === 'AND') {
			if (!isUnknownArray(value))
				throw new TypeError(`${path}.AND must be a list`)
			value.forEach((nested, position) => {
				conditions.push(
					...normalizeSchemaIndexWhere(
						nested,
						`${path}.AND[${String(position)}]`,
					),
				)
			})
		} else if (key === 'OR' || key === 'NOT') {
			throw new TypeError(`${path}.${key} is not portable in a partial index`)
		} else if (value === null) {
			conditions.push(
				immutableRecord({ kind: 'null', field: key, isNull: true }),
			)
		} else if (isPlainRecord(value)) {
			const entries = Object.entries(value)
			if (entries.length === 0) {
				throw new TypeError(`${path}.${key} must contain an operator`)
			}
			for (const [operator, operand] of entries) {
				conditions.push(
					readComparison(key, operator, operand, `${path}.${key}`),
				)
			}
		} else {
			conditions.push(readComparison(key, 'eq', value, `${path}.${key}`))
		}
	}
	if (conditions.length === 0) throw new TypeError(`${path} must not be empty`)
	return immutableArray(conditions)
}

const matchesKind = (kind: string, value: SchemaIndexLiteral): boolean => {
	switch (kind) {
		case 'boolean':
			return typeof value === 'boolean'
		case 'int':
			return typeof value === 'number' && Number.isSafeInteger(value)
		case 'float':
			return typeof value === 'number'
		case 'bigint':
			return typeof value === 'bigint'
		default:
			return typeof value === 'string'
	}
}

/** Checks each condition against the final field it names; unknown names are rejected. */
export const assertSchemaIndexConditions = (
	conditions: readonly SchemaIndexCondition[],
	fields: Readonly<Record<string, GenericField>>,
	path: string,
): void => {
	for (const condition of conditions) {
		const field = Object.hasOwn(fields, condition.field)
			? fields[condition.field]
			: undefined
		if (field === undefined) {
			throw new TypeError(`Unknown index field: ${condition.field}`)
		}
		const scalar =
			!hasListOption(field.options) && comparableKinds.has(field.kind)
		const nullable = scalar || field.kind === 'pointer'
		const label = `${path}.${condition.field}`
		if (condition.kind === 'null') {
			if (!nullable || hasListOption(field.options)) {
				throw new TypeError(
					`${label} cannot be tested for null in a partial index`,
				)
			}
			continue
		}
		if (!scalar) {
			throw new TypeError(`${label} must be a scalar non-list field`)
		}
		if (condition.kind !== 'equal' && !orderedKinds.has(field.kind)) {
			throw new TypeError(`${label} does not support ordered comparisons`)
		}
		if (!matchesKind(field.kind, condition.value)) {
			throw new TypeError(`${label} must compare a ${field.kind} value`)
		}
	}
}
