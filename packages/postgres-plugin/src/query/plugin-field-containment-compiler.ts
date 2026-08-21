import {
	getPluginFieldStorageCodec,
	getPluginFieldStructuralContains,
	type FieldValidationPlan,
} from '@ultimabase/core'
import { isPlainRecord } from '@ultimabase/shared'
import { sql, type SQL } from 'drizzle-orm'

import type { PostgresStorageKind } from '../schema/contracts.js'
import { stringifyPostgresJsonbParameter } from './jsonb-parameter.js'

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

const stringifyPortableOperand = (value: unknown): string => {
	assertPortableJsonOperand(value, 'value', new WeakSet<object>())
	return stringifyPostgresJsonbParameter(value)
}

/** Compiles an opted-in plugin leaf, or yields when the target is not one. */
export const compilePostgresPluginFieldContains = (
	value: unknown,
	jsonb: SQL,
	plan: FieldValidationPlan | undefined,
	storage: PostgresStorageKind,
): SQL | undefined => {
	if (plan === undefined) return undefined

	const metadata = getPluginFieldStructuralContains(plan.field)

	if (metadata === undefined) return undefined

	const codec = getPluginFieldStorageCodec(plan.field)
	if (plan.kind !== 'scalar' || storage !== 'jsonb' || codec === undefined) {
		throw new TypeError(
			'PostgreSQL plugin containment requires a matching JSONB field plan and codec',
		)
	}

	// Core already converted the logical input into this partial storage fragment.
	const operand = stringifyPortableOperand(value)
	return sql`${jsonb} @> ${operand}::jsonb`
}
