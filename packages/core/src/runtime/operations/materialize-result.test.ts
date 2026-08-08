import type {
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
})
