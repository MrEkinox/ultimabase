import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it, vi } from 'vitest'

import {
	createRuntimeBehaviorBoundaries,
	QueryBuilder,
	UltimaBase,
	type FindManyOperationAst,
} from '@ultimabase/core'
import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { validationPlugin } from './plugin.js'

const ValidationApplication = UltimaBase.use(validationPlugin())

const observingValidator = <TValue>(
	validate: (value: unknown) => void,
): StandardSchemaV1<TValue> => ({
	'~standard': {
		validate: (value: unknown) => {
			validate(value)
			return { value: value as TValue }
		},
		vendor: 'single-pass-result-test',
		version: 1,
	},
})

describe('single-pass result boundaries', () => {
	it('snapshots read results without application validation', () => {
		const validate = vi.fn()
		const schema = ValidationApplication.Schema.define({
			className: 'SinglePassReadResult',
			fields: (field) => ({
				name: field.string({
					validation: observingValidator<string>(validate),
				}),
			}),
		})
		const operation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(schema).select({ name: true }).ast,
		}) satisfies FindManyOperationAst<typeof schema>

		const boundaries = createRuntimeBehaviorBoundaries()
		const result = immutableArray([
			immutableRecord({
				id: '0198d70e-e400-7000-8000-000000000012',
				name: 'legacy',
			}),
		])
		const databaseSnapshot = boundaries.snapshotDatabaseResultReplacement(
			operation,
			result,
		)
		const finalSnapshot = boundaries.snapshotResultReplacement(
			operation,
			databaseSnapshot,
		)

		expect(validate).not.toHaveBeenCalled()
		expect(finalSnapshot).toStrictEqual(result)
	})
})
