import { describe, expect, it } from 'vitest'

import {
	registerQueryTerminalExecutionHandler,
	runWithQueryExecution,
	type NormalizedQueryTerminalOptions,
	type QueryExecutionDispatcher,
	type QueryTerminalPrivateScope,
} from '../../query/operations/execution.js'
import {
	RelationArticle,
	RelationTag,
} from '../fields/builtins/relation-fixture.test-support.js'
import { materializeSchemaModel } from '../schema/model.js'
import { Relation } from './relation.js'

interface ScopedExecution {
	readonly kind: string
	readonly operation: Readonly<Record<string, unknown>>
	readonly options: NormalizedQueryTerminalOptions
	readonly scope: QueryTerminalPrivateScope | undefined
}

/** Records the private terminal boundary without interpreting relation storage. */
class RelationScopeDispatcher implements QueryExecutionDispatcher {
	readonly executions: ScopedExecution[] = []

	constructor() {
		registerQueryTerminalExecutionHandler(this, (operation, options, scope) => {
			if (
				typeof operation !== 'object' ||
				operation === null ||
				!('kind' in operation) ||
				typeof operation.kind !== 'string'
			) {
				throw new TypeError(
					'Expected one normalized QueryBuilder terminal operation',
				)
			}

			this.executions.push({ kind: operation.kind, operation, options, scope })

			switch (operation.kind) {
				case 'count':
					return Promise.resolve(0)
				case 'exists':
					return Promise.resolve(false)
				case 'find-many':
					return Promise.resolve([])
				case 'update-one':
					return Promise.resolve({ id: articleId })
				default:
					return Promise.resolve(null)
			}
		})
	}

	execute(): Promise<unknown> {
		return Promise.reject(
			new TypeError('Relation terminals must use their private scope handler'),
		)
	}
}

const articleId = '0198f090-2a50-7000-8000-000000000081'

describe('Relation handles', () => {
	it('creates frozen opaque handles only from protected persisted identity', () => {
		const article = materializeSchemaModel(
			RelationArticle,
			{},
			{ objectId: articleId, selectedFields: [] },
		)
		const handle = article.relation('tags')
		const inverse = materializeSchemaModel(RelationTag, {
			id: '0198f090-2a50-7000-8000-000000000082',
		}).relation('articles')

		expect(handle).toBeInstanceOf(Relation)
		expect(Relation.is(handle)).toBe(true)
		expect(Relation.is({})).toBe(false)
		expect(Object.isFrozen(handle)).toBe(true)
		expect(Object.keys(handle)).toStrictEqual([])
		expect(JSON.stringify(handle)).toBe('{}')
		expect(inverse).toBeInstanceOf(Relation)

		const draft = new RelationArticle({})
		const draftRelation: unknown = (
			draft as object & { readonly relation?: unknown }
		).relation

		if (typeof draftRelation !== 'function') {
			throw new TypeError('Schema model prototype must expose relation')
		}

		const callDraftRelation = draftRelation as (
			this: object,
			fieldName: string,
		) => unknown

		expect(() => callDraftRelation.call(draft, 'tags')).toThrow(
			new TypeError('Schema model relation requires persisted model state'),
		)
		expect(() =>
			materializeSchemaModel(RelationArticle, {}).relation('tags'),
		).toThrow(
			new TypeError(
				'Schema model relation requires protected persisted identity',
			),
		)
		expect(() => article.relation('missing' as 'tags')).toThrow(
			new TypeError(
				'Schema model relation field must be a relation: RelationArticle.missing',
			),
		)
	})

	it('retains one private relation scope through every direct read', async () => {
		const article = materializeSchemaModel(
			RelationArticle,
			{ id: articleId },
			{ objectId: articleId },
		)
		const relation = article.relation('tags')
		const dispatcher = new RelationScopeDispatcher()

		await runWithQueryExecution({}, dispatcher, async () => {
			await expect(
				relation.findMany({
					where: { id: { eq: articleId } },
					select: { id: true },
					orderBy: [{ createdAt: 'asc' }],
					limit: 20,
				}),
			).resolves.toStrictEqual([])
			await expect(relation.count({}, { useMasterKey: true })).resolves.toBe(0)
			await expect(relation.exists()).resolves.toBe(false)
		})

		expect(dispatcher.executions.map(({ kind }) => kind)).toStrictEqual([
			'find-many',
			'count',
			'exists',
		])

		for (const execution of dispatcher.executions) {
			expect(execution.scope).toStrictEqual({
				fieldPath: ['tags'],
				kind: 'relation',
				source: RelationArticle,
				sourceObjectId: articleId,
				target: RelationTag,
			})
			expect(Object.isFrozen(execution.scope)).toBe(true)
			if (execution.scope?.kind !== 'relation') {
				throw new TypeError('Expected one private relation scope')
			}
			expect(Object.isFrozen(execution.scope.fieldPath)).toBe(true)
		}

		expect(dispatcher.executions[1]?.options.useMasterKey).toBe(true)
	})

	it('rejects attempts to inject framework-owned relation scope state', () => {
		const article = materializeSchemaModel(RelationArticle, { id: articleId })
		const dispatcher = new RelationScopeDispatcher()

		expect(() =>
			runWithQueryExecution({}, dispatcher, () =>
				// @ts-expect-error -- Private scope is never part of public read inputs.
				article.relation('tags').findMany({
					sourceObjectId: articleId,
				}),
			),
		).toThrow('find-many input contains an unknown clause')
		expect(dispatcher.executions).toStrictEqual([])
	})

	it('emits immutable relation deltas through protected source updates', async () => {
		const article = materializeSchemaModel(RelationArticle, { id: articleId })
		const firstTag = RelationTag.pointer('0198f090-2a50-7000-8000-000000000083')
		const secondTag = RelationTag.pointer(
			'0198f090-2a50-7000-8000-000000000084',
		)
		const relation = article.relation('tags')
		const dispatcher = new RelationScopeDispatcher()

		await runWithQueryExecution({}, dispatcher, async () => {
			await relation.connect(firstTag)
			await relation.disconnect([firstTag, secondTag], { useMasterKey: true })
			await relation.set([])
			await relation.clear()
		})

		expect(dispatcher.executions.map(({ kind }) => kind)).toStrictEqual([
			'update-one',
			'update-one',
			'update-one',
			'update-one',
		])
		expect(dispatcher.executions[0]?.operation).toMatchObject({
			kind: 'update-one',
			update: {
				kind: 'update-expression',
				operations: [
					{
						field: 'tags',
						kind: 'relation',
						value: { action: 'connect', targets: [firstTag] },
					},
				],
			},
		})
		expect(dispatcher.executions[1]?.options.useMasterKey).toBe(true)

		for (const execution of dispatcher.executions) {
			expect(execution.scope).toMatchObject({
				kind: 'row-filter',
				nativeAccessDeniedAsMissing: true,
			})
			expect(JSON.stringify(execution.operation)).not.toContain(articleId)
			expect(Object.isFrozen(execution.operation)).toBe(true)
		}
	})

	it('rejects empty, duplicate, and incompatible mutation targets', async () => {
		const article = materializeSchemaModel(RelationArticle, { id: articleId })
		const relation = article.relation('tags')
		const tag = RelationTag.pointer('0198f090-2a50-7000-8000-000000000085')
		const incompatible = RelationArticle.pointer(articleId)

		await expect(
			relation.connect([] as unknown as [typeof tag]),
		).rejects.toThrow('Relation mutation targets must contain a Pointer')
		await expect(relation.connect([tag, tag])).rejects.toThrow(
			'Relation mutation contains duplicate target',
		)
		await expect(
			relation.connect(incompatible as unknown as typeof tag),
		).rejects.toThrow('Relation mutation target must point to RelationTag')
	})
})
