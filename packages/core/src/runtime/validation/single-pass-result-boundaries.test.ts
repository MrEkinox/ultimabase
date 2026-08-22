import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it, vi } from 'vitest'

import { QueryBuilder, type FindManyOperationAst } from '../../query/index.js'
import { Schema, SchemaRegistry } from '../../schema/index.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	readRuntimeSchemaModelMetadata,
	retainRuntimeSchemaModelMetadata,
} from '../operations/model-metadata.js'
import { createRuntimeBehaviorBoundaries } from '../behaviors/validation-boundaries.js'

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
	it('snapshots included and replaced results without application validation', () => {
		const validate = vi.fn()
		const targetId = '0198d70e-e400-7000-8000-000000000011'
		const target = Schema.define({
			className: 'SinglePassIncludedTarget',
			fields: (field) => ({
				name: field.string({
					validation: observingValidator<string>(validate),
				}),
			}),
		})
		const source = Schema.define({
			className: 'SinglePassIncludedSource',
			fields: (field) => ({
				target: field.pointer({ target: 'SinglePassIncludedTarget' }),
			}),
		})
		new SchemaRegistry([target, source]).resolveSchemaTargets()
		const targetQuery = new QueryBuilder(target).select({ name: true })
		const operation = immutableRecord({
			kind: 'find-many',
			query: new QueryBuilder(source)
				.select({ target: true })
				.include('target', (query) => query.select({ name: true })).ast,
		}) satisfies FindManyOperationAst<typeof source>
		const targetOperation = immutableRecord({
			kind: 'find-one',
			query: targetQuery.ast,
		})
		const includedTarget = immutableRecord({ id: targetId, name: 'legacy' })

		retainRuntimeSchemaModelMetadata(
			targetOperation,
			immutableArray([targetId]),
			includedTarget,
			immutableArray(['name', 'id']),
		)

		const boundaries = createRuntimeBehaviorBoundaries()
		const result = immutableArray([
			immutableRecord({
				id: '0198d70e-e400-7000-8000-000000000012',
				target: includedTarget,
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
		const snapshotTarget: unknown = finalSnapshot[0]?.target

		expect(validate).not.toHaveBeenCalled()
		expect(isPlainRecord(snapshotTarget)).toBe(true)
		if (!isPlainRecord(snapshotTarget)) {
			throw new TypeError('Expected an included target snapshot')
		}
		expect(readRuntimeSchemaModelMetadata(snapshotTarget)).toMatchObject({
			objectId: targetId,
		})
	})
})
