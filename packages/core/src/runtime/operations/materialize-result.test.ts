import type {
	CreateOneOperationAst,
	ExecutableOperationAst,
	FindManyOperationAst,
} from '../../query/index.js'
import { QueryBuilder } from '../../query/query/query.js'

import type { DatabaseOperationResult } from '../database/contracts.js'
import { describe, expect, it } from 'vitest'

import { materializeOperationResult } from './materialize-result.js'
import { UltimaBase } from '../application/ultima-base.js'

const ResultSchema = UltimaBase.Schema.define({
	className: 'MaterializedResult',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

const query = new QueryBuilder(ResultSchema).ast
const update = { kind: 'update-expression', operations: [] } as const
const collectionOperations = [
	{
		kind: 'create-many',
		schema: query.schema,
		selection: query.selection,
		inputs: [],
	},
	{ kind: 'delete-many', query },
	{ kind: 'find-many', query },
	{ kind: 'update-many', query, update },
	{
		kind: 'upsert-many',
		schema: query.schema,
		selection: query.selection,
		items: [],
	},
] as const satisfies readonly ExecutableOperationAst[]
const nullableOperations = [
	{ kind: 'delete-one', query },
	{ kind: 'find-one', query },
	{ kind: 'get', query, id: '0198f090-2a50-7000-8000-000000000032' },
	{ kind: 'update-one', query, update },
] as const satisfies readonly ExecutableOperationAst[]

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
		} as unknown as DatabaseOperationResult<typeof operation>

		expect(() => materializeOperationResult(operation, result)).toThrow(
			new TypeError('Runtime result references an invalid schema model class'),
		)
	})

	it.each(collectionOperations)(
		'materializes immutable $kind collections as the exact schema class',
		(operation) => {
			const records = [
				{
					id: '0198f090-2a50-7000-8000-000000000032',
					createdAt: '2026-08-02T00:00:00.000Z',
					updatedAt: '2026-08-02T00:00:00.000Z',
					title: 'Persisted',
				},
			]
			const result = materializeOperationResult(operation, records)

			expect(result).toHaveLength(1)
			expect(result[0]).toBeInstanceOf(ResultSchema)
			expect(result[0]?.toJSON()).toStrictEqual(records[0])
			expect(Object.isFrozen(result)).toBe(true)
			expect(Object.isFrozen(result[0])).toBe(true)
			expect(records[0]).not.toBeInstanceOf(ResultSchema)
		},
	)

	it.each(nullableOperations)(
		'preserves null for $kind without reading invalid schema metadata',
		(operation) => {
			const forged = {
				...operation,
				query: undefined,
			} as unknown as typeof operation
			expect(materializeOperationResult(forged, null)).toBeNull()
		},
	)

	it.each([
		['find-many', 'Runtime collection result must be an array'],
		['create-many', 'Runtime result references an invalid schema model class'],
		['delete-many', 'Runtime result references an invalid schema model class'],
		['update-many', 'Runtime result references an invalid schema model class'],
		['upsert-many', 'Runtime result references an invalid schema model class'],
	] as const)('preserves %s error precedence', (kind, message) => {
		const operation = { kind, schema: { definition: {}, kind: 'schema' } }
		const malformed = 1 as unknown as DatabaseOperationResult<typeof operation>

		expect(() => materializeOperationResult(operation, malformed)).toThrow(
			new TypeError(message),
		)
	})
})
