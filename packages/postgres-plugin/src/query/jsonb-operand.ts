import {
	getPluginFieldStorageCodec,
	getPluginFieldStructuralContains,
	type FieldValidationPlan,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { sql, type SQL } from 'drizzle-orm'

import type { PostgresStorageKind } from '../schema/contracts.js'

/** Serializes one validated value without interpolating JSON into SQL text. */
export const stringifyJsonbParameter = (value: unknown): string => {
	const serialized: unknown = JSON.stringify(value)

	if (typeof serialized !== 'string') {
		throw new TypeError('PostgreSQL JSONB filter value must be serializable')
	}

	return serialized
}

/** Rejects operands that JSON.stringify would silently coerce or drop. */
const assertPortableJsonOperand = (
	value: unknown,
	path: string,
	ancestors: WeakSet<object>,
): void => {
	if (
		value === null ||
		typeof value === 'boolean' ||
		typeof value === 'string'
	) {
		return
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError(
				'PostgreSQL plugin containment operand must contain finite numbers',
			)
		}
		return
	}

	if (typeof value !== 'object') {
		throw new TypeError(
			`PostgreSQL plugin containment operand contains a non-JSON value: ${path}`,
		)
	}

	if (ancestors.has(value)) {
		throw new TypeError(
			'PostgreSQL plugin containment operand must not contain cycles',
		)
	}

	ancestors.add(value)
	try {
		if (Array.isArray(value)) {
			for (const [index, item] of value.entries()) {
				assertPortableJsonOperand(item, `${path}[${String(index)}]`, ancestors)
			}
			return
		}

		if (!isPlainRecord(value)) {
			throw new TypeError(
				'PostgreSQL plugin containment operand must contain only plain objects',
			)
		}

		for (const [key, item] of Object.entries(value)) {
			assertPortableJsonOperand(item, `${path}.${key}`, ancestors)
		}
	} finally {
		ancestors.delete(value)
	}
}

/** Compiles an opted-in plugin leaf, or yields when the target is not one. */
export const compilePostgresPluginFieldContains = (
	value: unknown,
	jsonb: SQL,
	plan: FieldValidationPlan | undefined,
	storage: PostgresStorageKind,
): SQL | undefined => {
	if (
		plan === undefined ||
		getPluginFieldStructuralContains(plan.field) === undefined
	) {
		return undefined
	}

	if (
		plan.kind !== 'scalar' ||
		storage !== 'jsonb' ||
		getPluginFieldStorageCodec(plan.field) === undefined
	) {
		throw new TypeError(
			'PostgreSQL plugin containment requires a matching JSONB field plan and codec',
		)
	}

	// Core already converted the logical input into this partial storage fragment.
	assertPortableJsonOperand(value, 'value', new WeakSet<object>())
	return sql`${jsonb} @> ${stringifyJsonbParameter(value)}::jsonb`
}
