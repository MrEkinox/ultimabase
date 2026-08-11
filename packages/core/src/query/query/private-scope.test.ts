import { Schema } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import { readQueryPrivateScope, scopeQueryToObjectId } from './private-scope.js'
import { hydrateQueryFromAst, QueryBuilder } from './query.js'

const articleSchema = Schema.define({
	className: 'PrivateScopeArticle',
	fields: (field) => ({ title: field.string() }),
})

describe('private Query scope ownership', () => {
	it('retains object identity outside immutable AST branches', () => {
		const source = new QueryBuilder(articleSchema).select({ title: true })
		const scoped = scopeQueryToObjectId(
			source,
			'0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
		)
		const privateScope = readQueryPrivateScope(scoped)
		const hydrated = hydrateQueryFromAst(scoped.ast, privateScope)
		const branch = hydrated.limit(5)

		expect(scoped.ast).toBe(source.ast)
		expect(Object.keys(scoped)).toStrictEqual(['ast', 'schema'])
		expect(readQueryPrivateScope(source)).toBeUndefined()
		expect(privateScope).toMatchObject({
			kind: 'row-filter',
			objectId: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a',
		})
		expect(readQueryPrivateScope(hydrated)).toBe(privateScope)
		expect(readQueryPrivateScope(branch)).toBe(privateScope)
		expect(branch.ast).not.toHaveProperty('scope')
		expect(branch.ast).not.toHaveProperty('objectId')
	})
})
