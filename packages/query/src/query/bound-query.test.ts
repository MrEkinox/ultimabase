import {
	booleanField,
	defineSchema,
	intField,
	stringField,
} from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import type {
	ExecutableOperationAst,
	OperationAstNode,
} from '../operations/contracts.js'
import type { QueryOperationExecutor } from '../operations/executor.js'
import type { InferOperationResult } from '../operations/results.js'
import { BoundQuery } from './bound-query.js'
import { Query } from './query.js'

const articleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField(),
		slug: stringField({ indexed: 'unique' }),
		published: booleanField(),
		views: intField(),
	},
})

const terminalError = new Error('Fixture executor does not return results')

/** Records terminal ASTs while keeping result fabrication out of Query tests. */
class RecordingQueryExecutor implements QueryOperationExecutor<
	typeof articleSchema
> {
	readonly operations: OperationAstNode[] = []

	execute<
		const TOperation extends ExecutableOperationAst<typeof articleSchema>,
	>(operation: TOperation): Promise<InferOperationResult<TOperation>> {
		this.operations.push(operation)

		return Promise.reject(terminalError)
	}
}

describe('BoundQuery', () => {
	it('preserves one engine across immutable query branches', () => {
		const engine = { name: 'request-engine' } as const
		const unbound = new Query(articleSchema)
		const base = unbound.bind(engine)
		const selected = base
			.equalTo('published', true)
			.select('id', 'title')
			.descending('createdAt')
			.limit(10)

		expect(selected).not.toBe(base)
		expect(selected.engine).toBe(engine)
		expect(base.unbound).toBe(unbound)
		expect(selected.schema).toBe(articleSchema)
		expect(selected.ast.selection.fields).toStrictEqual([
			{ kind: 'selected-field', field: 'id' },
			{ kind: 'selected-field', field: 'title' },
		])
		expect(selected.ast.where?.expression).toStrictEqual({
			kind: 'equal',
			field: 'published',
			value: true,
		})
		expect(base.ast.selection.fields).toStrictEqual([])
		expect(unbound.ast.where).toBeUndefined()
		expect(Object.isFrozen(base)).toBe(true)
		expect(Object.isFrozen(selected)).toBe(true)
	})

	it('delegates the complete Query builder surface to bound branches', () => {
		const engine = { name: 'request-engine' } as const
		const reusable = new Query(articleSchema).equalTo('published', true)
		const query = new Query(articleSchema)
			.bind(engine)
			.notEqualTo('published', false)
			.greaterThan('views', 1)
			.greaterThanOrEqualTo('views', 2)
			.lessThan('views', 100)
			.lessThanOrEqualTo('views', 99)
			.containedIn('views', [2, 3])
			.notContainedIn('views', [0])
			.contains('title', 'Base')
			.startsWith('title', 'Ultima')
			.endsWith('title', 'Base')
			.matches('title', { source: '^Ultima', flags: [] })
			.exists('title')
			.doesNotExist('views')
			.and(reusable)
			.or(reusable)
			.not(reusable)
			.ascending('title')
			.skip(5)
		const cursor = new Query(articleSchema).bind(engine).after('cursor')

		expect(query.ast.where?.expression.kind).toBe('and')
		expect(query.ast.ordering.orders).toStrictEqual([
			{ kind: 'order', field: 'title', direction: 'ascending' },
		])
		expect(query.ast.pagination).toStrictEqual({
			kind: 'offset-pagination',
			skip: 5,
		})
		expect(cursor.ast.pagination).toStrictEqual({
			kind: 'cursor-pagination',
			after: 'cursor',
		})
		expect(query.engine).toBe(engine)
	})

	it('retains reusable logical filters without adopting their clauses', () => {
		const engine = { name: 'request-engine' } as const
		const reusable = new Query(articleSchema)
			.equalTo('published', true)
			.limit(5)
		const bound = new BoundQuery(new Query(articleSchema).limit(20), engine)
		const combined = bound.and(reusable)

		expect(combined.ast.where?.expression).toBe(reusable.ast.where?.expression)
		expect(combined.ast.limit).toBe(20)
		expect(combined.engine).toBe(engine)
	})

	it('creates every terminal AST through one neutral executor', async () => {
		const executor = new RecordingQueryExecutor()
		const query = new Query(articleSchema)
			.equalTo('published', true)
			.select('id', 'title')
			.bind(executor)
		const createInput = { title: 'Created' }
		const unique = new Query(articleSchema)
			.equalTo('slug', 'created')
			.select('id', 'title')
			.bind(executor)
		const bulkUpsertQuery = new Query(articleSchema).equalTo('slug', 'created')
		const upsertInput = {
			create: createInput,
			update: { increment: { views: 1 } },
		} as const
		const executions: readonly Promise<unknown>[] = [
			query.find(),
			query.first(),
			query.get('article-1'),
			query.count(),
			query.exists(),
			query.createOne(createInput),
			query.create(createInput),
			query.createMany([createInput]),
			query.updateOne({ increment: { views: 1 } }),
			query.updateMany({ increment: { views: 1 } }),
			unique.upsertOne(upsertInput),
			unique.upsert(upsertInput),
			query.upsertMany([{ query: bulkUpsertQuery, ...upsertInput }]),
			query.deleteOne(),
			query.deleteMany(),
		]

		for (const execution of executions) {
			await expect(execution).rejects.toBe(terminalError)
		}

		expect(
			executor.operations.map((operation) => operation.kind),
		).toStrictEqual([
			'find',
			'first',
			'get',
			'count',
			'exists',
			'create-one',
			'create-one',
			'create-many',
			'update-one',
			'update-many',
			'upsert-one',
			'upsert-one',
			'upsert-many',
			'delete-one',
			'delete-many',
		])
		expect(
			executor.operations.every((operation) => Object.isFrozen(operation)),
		).toBe(true)
		expect(executor.operations[2]).toMatchObject({ id: 'article-1' })
		expect(executor.operations[5]).toMatchObject({
			schema: query.ast.schema,
			input: createInput,
		})
		expect(executor.operations[7]).toMatchObject({
			inputs: [createInput],
			options: { atomic: true },
		})
		expect(executor.operations[8]).toMatchObject({
			update: {
				kind: 'update-expression',
				operations: [{ kind: 'increment', field: 'views', value: 1 }],
			},
		})
		expect(executor.operations[10]).toMatchObject({
			target: { kind: 'unique-upsert-target', fields: ['slug'] },
		})
		expect(executor.operations[12]).toMatchObject({
			options: { atomic: true },
			items: [
				{
					target: { kind: 'unique-upsert-target', fields: ['slug'] },
				},
			],
		})
	})

	it('keeps field existence filtering available beside the terminal', () => {
		const executor = new RecordingQueryExecutor()
		const filtered = new Query(articleSchema).bind(executor).exists('title')
		const opaque = new Query(articleSchema).bind({ name: 'opaque' })

		expect(filtered.ast.where?.expression).toStrictEqual({
			kind: 'exists',
			field: 'title',
			exists: true,
		})
		expect(() =>
			// @ts-expect-error -- Opaque bindings cannot execute zero-argument exists.
			opaque.exists(),
		).toThrow(new TypeError('bound query engine cannot execute operations'))
	})
})
