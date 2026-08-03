import { describe, expect, it } from 'vitest'

import {
	registerQueryTerminalExecutionHandler,
	runWithQueryExecution,
	type NormalizedQueryTerminalOptions,
	type QueryExecutionDispatcher,
	type QueryTerminalPrivateScope,
} from '../../query/operations/execution.js'
import type { QueryScope } from '../../query/query/scope.js'
import {
	RelationArticle,
	RelationTag,
} from '../fields/builtins/relation-fixture.test-support.js'
import { materializeSchemaModel } from '../schema/model.js'
import { Relation } from './relation.js'

interface ScopedExecution {
	readonly kind: string
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
				throw new TypeError('Expected one normalized Query terminal operation')
			}

			this.executions.push({ kind: operation.kind, options, scope })

			switch (operation.kind) {
				case 'count':
					return Promise.resolve(0)
				case 'exists':
					return Promise.resolve(false)
				case 'find':
					return Promise.resolve([])
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
		expect(handle.query().schema).toBe(RelationTag)
		expect(inverse.query().schema).toBe(RelationArticle)
		expect(handle.query().ast.schema.definition).toBe(RelationTag)
		expect(JSON.stringify(handle.query().ast)).not.toContain(articleId)
		expect(JSON.stringify(handle.query().ast)).not.toContain('tags')

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

	it('retains one private relation scope through every public Query branch', async () => {
		const article = materializeSchemaModel(
			RelationArticle,
			{ id: articleId },
			{ objectId: articleId },
		)
		const base = article.relation('tags').query()
		const query = base
			.select('id')
			.ascending('createdAt')
			.limit(20)
			.after()
			.use((current) => current.equalTo('id', articleId))
		const dispatcher = new RelationScopeDispatcher()

		await runWithQueryExecution({}, dispatcher, async () => {
			await expect(query.find()).resolves.toStrictEqual([])
			await expect(query.count({ useMasterKey: true })).resolves.toBe(0)
			await expect(query.exists()).resolves.toBe(false)
		})

		expect(base.ast.selection.fields).toStrictEqual([])
		expect(query.ast.selection.fields).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
		])
		expect(dispatcher.executions.map(({ kind }) => kind)).toStrictEqual([
			'find',
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

	it('does not let a reusable Query scope discard the relation restriction', async () => {
		const article = materializeSchemaModel(RelationArticle, { id: articleId })
		const discardingScope = (() =>
			RelationTag.query().limit(1)) as unknown as QueryScope<typeof RelationTag>
		const replacedPublicBranch = article
			.relation('tags')
			.query()
			.use(discardingScope)
		const dispatcher = new RelationScopeDispatcher()

		await runWithQueryExecution({}, dispatcher, () =>
			replacedPublicBranch.find(),
		)

		expect(replacedPublicBranch.ast.limit).toBe(1)
		expect(dispatcher.executions[0]?.scope).toMatchObject({
			fieldPath: ['tags'],
			kind: 'relation',
			sourceObjectId: articleId,
		})
	})
})
