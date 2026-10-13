import { FrameworkError } from '../../foundation.js'
import {
	snapshotScalarFieldValue,
	type GenericField,
	type SchemaDefinition,
} from '../../schema/index.js'
import {
	hasListOption,
	isFieldNullable,
} from '../../schema/fields/base/options.js'
import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	QueryExpressionNode,
	QueryFieldName,
	QueryOrderingNode,
	QueryOrderNode,
} from '../ast/contracts.js'
import {
	normalizeLogicalFilter,
	type QueryFilterExpression,
	type QueryFilterNode,
} from '../filters/logical.js'
import { readPersistedQueryFields } from '../ast/schema.js'
import { validateScalarFieldShape } from '../../schema/plans/scalar-shape-validation.js'
import { orderableFieldKinds } from '../../schema/fields/base/filter-kinds.js'

const orderableKinds: ReadonlySet<string> = new Set(orderableFieldKinds)

/** Tells whether one persisted field may appear in `orderBy`. */
export const isOrderableQueryField = (field: GenericField): boolean =>
	orderableKinds.has(field.kind) && !hasListOption(field.options)

/** One ordered field of a position with its validated value. */
export interface QueryPositionValue<TFieldName extends string = string> {
	readonly direction: QueryOrderNode['direction']
	readonly field: TFieldName
	readonly value: unknown
}

/**
 * Completes an ordering with `id` ascending unless `id` is already ordered,
 * so the order of a collection read is total (ADR-0309, decision 3).
 */
export const completeQueryOrdering = <TFieldName extends string>(
	ordering: QueryOrderingNode<TFieldName>,
): QueryOrderingNode<TFieldName> =>
	ordering.orders.some((order) => order.field === 'id')
		? ordering
		: immutableRecord({
				kind: 'ordering',
				orders: immutableArray([
					...ordering.orders,
					immutableRecord({
						kind: 'order',
						// Every schema declares the `id` system field.
						field: 'id' as TFieldName,
						direction: 'ascending',
					}),
				]),
			})

/**
 * Reports every invalid `after` position, `skip` combined with `after`, and
 * every malformed or mismatched transport cursor with one public shape.
 */
export const createInvalidPositionError = (
	reason: string,
	publicReason = 'is invalid',
): FrameworkError<'VALIDATION_ERROR'> =>
	new FrameworkError('VALIDATION_ERROR', `findMany after ${reason}`, {
		publicMessage: `The after position ${publicReason}.`,
		publicDetails: { parameter: 'after' },
		internalDetails: { kind: 'query-position-invalid' },
	})

/**
 * Reads the value of every ordered field and validates it against its field.
 * A missing field names every missing ordered field (ADR-0309, decision 4).
 */
export const readQueryPosition = <TFieldName extends string>(
	schema: SchemaDefinition,
	ordering: QueryOrderingNode<TFieldName>,
	position: unknown,
): readonly QueryPositionValue<TFieldName>[] => {
	if (
		typeof position !== 'object' ||
		position === null ||
		isUnknownArray(position)
	) {
		throw createInvalidPositionError('must be a result object')
	}

	// Own properties only: inherited members are never ordered values.
	const read = (field: string): unknown => {
		if (!Object.hasOwn(position, field)) return undefined
		const value: unknown = Reflect.get(position, field)
		return value
	}

	const missing = ordering.orders
		.map(({ field }) => field)
		.filter((field) => read(field) === undefined)

	if (missing.length > 0) {
		const names = missing.join(', ')

		throw createInvalidPositionError(
			`is missing the ordered fields ${names}`,
			`is missing the ordered fields ${names}`,
		)
	}

	const fields = readPersistedQueryFields(schema)

	return immutableArray(
		ordering.orders.map(({ direction, field: fieldName }) => {
			const field = fields[fieldName]
			const value = read(fieldName)

			if (field === undefined) {
				throw new TypeError(`query.orderBy.${fieldName} is not a schema field`)
			}

			if (value === null) {
				if (!isFieldNullable(field)) {
					throw createInvalidPositionError(`${fieldName} must not be null`)
				}

				return immutableRecord({ direction, field: fieldName, value: null })
			}

			try {
				return immutableRecord({
					direction,
					field: fieldName,
					value: snapshotScalarFieldValue(field, value, `after.${fieldName}`),
				})
			} catch (error: unknown) {
				if (!(error instanceof TypeError)) throw error

				throw createInvalidPositionError(error.message)
			}
		}),
	)
}

/**
 * Reads an `after` position received from a caller or a transport cursor.
 * Shape rules (UUID syntax, decimal precision) bind it too: the adapter
 * compares these values, so a forged one must never reach the database.
 */
export const readRequestedQueryPosition = <TFieldName extends string>(
	schema: SchemaDefinition,
	ordering: QueryOrderingNode<TFieldName>,
	position: unknown,
): readonly QueryPositionValue<TFieldName>[] => {
	const values = readQueryPosition(schema, ordering, position)
	const fields = readPersistedQueryFields(schema)

	for (const { field: fieldName, value } of values) {
		const field = fields[fieldName]
		if (field === undefined || value === null) continue

		const [issue] = validateScalarFieldShape(field, value, [fieldName])

		if (issue !== undefined) {
			throw createInvalidPositionError(`${fieldName}: ${issue.message}`)
		}
	}

	return values
}

const leaf = (
	properties: QueryExpressionNode & Readonly<Record<string, unknown>>,
): QueryFilterExpression => immutableRecord(properties)

/** Matches rows whose ordered value equals the position value, `null` included. */
const equalTo = (field: string, value: unknown): QueryFilterExpression =>
	value === null
		? leaf({ kind: 'null', field, isNull: true })
		: leaf({ kind: 'equal', field, value })

/**
 * Matches rows strictly after the position value in one direction; `null`
 * sorts last in both directions (ADR-0302), so nothing follows a `null`.
 */
const strictlyAfter = (
	schema: SchemaDefinition,
	{ direction, field, value }: QueryPositionValue,
): QueryFilterExpression | undefined => {
	if (value === null) return undefined

	const comparison = leaf({
		kind: direction === 'ascending' ? 'greater-than' : 'less-than',
		field,
		value,
	})
	const definition = readPersistedQueryFields(schema)[field]

	return definition !== undefined && isFieldNullable(definition)
		? immutableRecord({
				kind: 'or',
				expressions: immutableArray([
					comparison,
					leaf({ kind: 'null', field, isNull: true }),
				]),
			})
		: comparison
}

/**
 * Turns a validated position into the caller filter selecting the rows
 * strictly after it in the complete order (ADR-0309, decision 4).
 */
export const createQueryPositionFilter = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	position: readonly QueryPositionValue<QueryFieldName<TSchema>>[],
): QueryFilterNode<TSchema> => {
	const branches: QueryFilterExpression[] = []

	for (const [index, value] of position.entries()) {
		const after = strictlyAfter(schema, value)

		if (after === undefined) continue

		const equalities = position
			.slice(0, index)
			.map((prior) => equalTo(prior.field, prior.value))

		branches.push(
			equalities.length === 0
				? after
				: immutableRecord({
						kind: 'and',
						expressions: immutableArray([...equalities, after]),
					}),
		)
	}

	// The leaves above name validated fields of this schema with snapshotted values.
	return normalizeLogicalFilter(
		branches.length === 0
			? immutableRecord({ kind: 'constant', value: false })
			: immutableRecord({ kind: 'or', expressions: immutableArray(branches) }),
	) as QueryFilterNode<TSchema>
}
