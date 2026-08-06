import type {
	CreateManyOperationAst,
	CreateOneOperationAst,
	FindManyOperationAst,
} from '../../query/index.js'
import { QueryBuilder } from '../../query/query/query.js'
import { Schema, stringField } from '../../schema/index.js'
import type { DatabaseOperationResult } from '../database/contracts.js'
import { describe, expect, it } from 'vitest'

import { materializeOperationResult } from './materialize-result.js'

const ResultSchema = Schema.define({
	className: 'MaterializedResult',
	fields: {
		title: stringField({ validation: { required: true } }),
	},
})

describe('Runtime result materialization', () => {
	it('rejects malformed collection and record outputs', () => {
		const find = {
			kind: 'find-many',
			query: new QueryBuilder(ResultSchema).ast,
		} satisfies FindManyOperationAst<typeof ResultSchema>
		const malformedCollection = 1 as unknown as DatabaseOperationResult<
			typeof find
		>

		expect(() => materializeOperationResult(find, malformedCollection)).toThrow(
			new TypeError('Runtime collection result must be an array'),
		)

		const create = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: new QueryBuilder(ResultSchema).ast.schema,
			input: { title: 'Created' },
		} satisfies CreateOneOperationAst<typeof ResultSchema>
		const malformedRecord = 'invalid' as unknown as DatabaseOperationResult<
			typeof create
		>

		expect(() => materializeOperationResult(create, malformedRecord)).toThrow(
			new TypeError('Runtime result must be a plain logical record'),
		)
	})

	it('rejects an operation whose schema identity was forged', () => {
		const operation = {
			kind: 'create-one',
			selection: { fields: [], kind: 'selection' },
			schema: { definition: {}, kind: 'schema' },
			input: { title: 'Created' },
		} as unknown as CreateOneOperationAst<typeof ResultSchema>
		const result = {
			title: 'Created',
		} as DatabaseOperationResult<typeof operation>

		expect(() => materializeOperationResult(operation, result)).toThrow(
			new TypeError('Runtime result references an invalid schema model class'),
		)
	})

	it('materializes only the successful non-atomic prefix', () => {
		const operation = {
			inputs: [{ title: 'First' }, { title: 'Second' }],
			kind: 'create-many',
			options: { atomic: false },
			selection: new QueryBuilder(ResultSchema).ast.selection,
			schema: new QueryBuilder(ResultSchema).ast.schema,
		} satisfies CreateManyOperationAst<typeof ResultSchema, false>
		const writeError = new Error('second input failed')
		const result: DatabaseOperationResult<typeof operation> = {
			error: writeError,
			failedIndex: 1,
			results: [
				{
					createdAt: '2026-08-03T00:00:00.000Z',
					id: '00000000-0000-7000-8000-000000000001',
					title: 'First',
					updatedAt: '2026-08-03T00:00:00.000Z',
				},
			],
			status: 'stopped',
		}
		const materialized = materializeOperationResult(operation, result)

		expect(materialized.status).toBe('stopped')
		expect(materialized.results[0]).toBeInstanceOf(ResultSchema)
		expect(materialized.results[0]?.title).toBe('First')
		expect(materialized.status === 'stopped' && materialized.error).toBe(
			writeError,
		)
	})
})
