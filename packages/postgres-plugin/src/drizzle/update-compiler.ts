import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { FieldValidationPlan } from '@ultimabase/core'
import { sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

import { stringifyJsonbParameter } from '../query/jsonb-operand.js'
import {
	resolveCompiledPostgresField,
	type CompiledPostgresSchema,
} from '../schema/contracts.js'
import { createPostgresValueCodec } from '../schema/value-codec.js'

type ObjectPlan = FieldValidationPlan & { readonly kind: 'object' }

/**
 * Compiles one object patch into a single JSONB expression (ADR-0032): each
 * supplied child replaces its stored value, a supplied nested object merges
 * recursively, and omitted children keep their stored values. The merge runs
 * in the UPDATE statement itself, so concurrent writers never lose a child.
 */
const compileObjectPatch = (
	stored: PgColumn | SQL,
	plan: ObjectPlan,
	patch: Readonly<Record<string, unknown>>,
): SQL => {
	const entries = Object.entries(patch)

	if (entries.length === 0) return sql`${stored}`

	// A stored null (SQL or JSON) has no children to keep.
	const base = sql`(case when jsonb_typeof(${stored}) = 'object' then ${stored} else '{}'::jsonb end)`
	const children = entries.map(([name, value]) => {
		const child = Object.hasOwn(plan.fields, name)
			? plan.fields[name]
			: undefined

		if (child === undefined) {
			throw new TypeError(
				`PostgreSQL object patch references unknown field: ${name}`,
			)
		}

		const compiled =
			child.kind === 'object' && isPlainRecord(value)
				? compileObjectPatch(sql`(${stored} -> ${name}::text)`, child, value)
				: sql`${stringifyJsonbParameter(createPostgresValueCodec(child).encode(value))}::jsonb`

		return sql`jsonb_build_object(${name}::text, ${compiled})`
	})

	return sql`(${base} || ${sql.join(children, sql` || `)})`
}

/** Compiles one Runtime-normalized atomic update into Drizzle set values. */
export const compilePostgresUpdate = (
	schema: CompiledPostgresSchema,
	value: unknown,
): Readonly<Record<string, unknown>> => {
	if (
		!isPlainRecord(value) ||
		value.kind !== 'update-expression' ||
		!isUnknownArray(value.operations) ||
		value.operations.length === 0
	) {
		throw new TypeError('PostgreSQL update expression is invalid')
	}

	const fields = new Set<string>()
	const compiled: [string, unknown][] = []

	for (const operation of value.operations) {
		if (
			!isPlainRecord(operation) ||
			typeof operation.field !== 'string' ||
			fields.has(operation.field)
		) {
			throw new TypeError('PostgreSQL update operation is invalid')
		}

		const fieldName = operation.field

		fields.add(fieldName)

		// Relation storage is handled separately while scalar system updates remain here.
		if (operation.kind === 'relation') continue

		const { column, plan } = resolveCompiledPostgresField(schema, fieldName)

		if (
			operation.kind !== 'set' &&
			operation.kind !== 'increment' &&
			operation.kind !== 'decrement'
		) {
			throw new TypeError(
				`Unsupported PostgreSQL update operation: ${String(operation.kind)}`,
			)
		}

		if (!Object.hasOwn(operation, 'value')) {
			throw new TypeError(
				operation.kind === 'set'
					? 'PostgreSQL set operation requires a value'
					: 'PostgreSQL numeric operation requires a value',
			)
		}

		if (operation.kind === 'set') {
			compiled.push([
				fieldName,
				plan.kind === 'object' && isPlainRecord(operation.value)
					? compileObjectPatch(column, plan, operation.value)
					: operation.value,
			])
			continue
		}

		const operand = sql.param(operation.value, column)

		compiled.push([
			fieldName,
			operation.kind === 'increment'
				? sql`${column} + ${operand}`
				: sql`${column} - ${operand}`,
		])
	}

	return immutableRecord(Object.fromEntries(compiled))
}
