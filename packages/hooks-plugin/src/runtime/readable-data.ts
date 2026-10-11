// Translates between Core's operation tree and the plain data hooks see
// (ADR-0318): `resolveInput` receives and returns data, Core keeps operations.
import { isDeepStrictEqual } from 'node:util'

import {
	normalizeUpdateExpression,
	type RuntimeRelationLinkChanges,
	type SchemaDefinition,
	type UpdateExpressionNode,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

/** Relation link changes of one write, by relation field name. */
export type RelationChanges = Readonly<
	Record<string, RuntimeRelationLinkChanges>
>

const emptyRelationChanges: RelationChanges = immutableRecord({})

const readOperations = (
	update: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
	isPlainRecord(update) && isUnknownArray(update.operations)
		? update.operations.filter(isPlainRecord)
		: []

/**
 * Reads the fields one update changes as plain data: a set value, a readable
 * `{ increment }` / `{ decrement }`, and each relation's link changes.
 */
export const readUpdateChanges = (
	update: unknown,
	relations: RelationChanges = emptyRelationChanges,
): Readonly<Record<string, unknown>> => {
	const entries: [string, unknown][] = []
	for (const operation of readOperations(update)) {
		if (typeof operation.field !== 'string') continue
		switch (operation.kind) {
			case 'set':
				entries.push([operation.field, operation.value])
				break
			case 'increment':
			case 'decrement':
				entries.push([
					operation.field,
					immutableRecord({ [operation.kind]: operation.value }),
				])
				break
			default:
				break
		}
	}
	for (const [field, changes] of Object.entries(relations)) {
		entries.push([field, changes])
	}
	return immutableRecord(Object.fromEntries(entries))
}

/** Rejects a `resolveInput` result that is not one plain data object. */
export const requireData = (value: unknown, path: string): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must return a plain object or undefined`)
	}
}

/**
 * Turns the changes a hook returned back into an update expression. Entries
 * the hook kept unchanged keep their original operation (Core's generated
 * values included); relation link changes are read-only: they come from the
 * nested write graph.
 */
export const writeUpdateChanges = (
	schema: SchemaDefinition,
	original: unknown,
	changes: unknown,
	relations: RelationChanges,
	path: string,
): UpdateExpressionNode => {
	requireData(changes, path)
	const record = changes as Readonly<Record<string, unknown>>
	const before = readUpdateChanges(original)
	const kept = readOperations(original).filter(
		(operation) =>
			typeof operation.field === 'string' &&
			Object.hasOwn(record, operation.field) &&
			Object.hasOwn(before, operation.field) &&
			isDeepStrictEqual(record[operation.field], before[operation.field]),
	)
	const keptFields = new Set(kept.map(({ field }) => field))
	const changed: [string, unknown][] = []
	for (const [field, value] of Object.entries(record)) {
		if (Object.hasOwn(relations, field) || isRelationField(schema, field)) {
			if (!isDeepStrictEqual(value, relations[field])) {
				throw new TypeError(
					`${path} cannot change the links of ${schema.className}.${field}; link them in the operation data`,
				)
			}
			continue
		}
		if (!keptFields.has(field)) changed.push([field, value])
	}
	for (const field of Object.keys(relations)) {
		if (!Object.hasOwn(record, field)) {
			throw new TypeError(
				`${path} cannot drop the link changes of ${schema.className}.${field}`,
			)
		}
	}
	const added =
		changed.length === 0
			? []
			: normalizeUpdateExpression(schema, Object.fromEntries(changed))
					.operations
	const order = Object.keys(schema.persistedFields)
	const position = (field: unknown): number => {
		const index = typeof field === 'string' ? order.indexOf(field) : -1
		return index === -1 ? Number.MAX_SAFE_INTEGER : index
	}
	return immutableRecord({
		kind: 'update-expression' as const,
		operations: immutableArray(
			[...kept, ...added].toSorted(
				(left, right) => position(left.field) - position(right.field),
			),
		),
	})
}

const isRelationField = (schema: SchemaDefinition, field: string): boolean =>
	Object.hasOwn(schema.fields, field) &&
	schema.fields[field]?.kind === 'relation'
