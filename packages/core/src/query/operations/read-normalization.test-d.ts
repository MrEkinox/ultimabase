import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	normalizeReadOperation,
	type CountOperationAst,
	type FindManyOperationAst,
	type ReadOperationAst,
} from '../../index.js'

const Article = Schema.define({
	className: 'NormalizedReadArticle',
	fields: (field) => ({ title: field.string() }),
})

test('exposes one schema-correlated transport-neutral read AST union', () => {
	const find = normalizeReadOperation(Article, 'find-many', {
		where: { title: { eq: 'hello' } },
	})
	const count = normalizeReadOperation(Article, 'count', {})

	expectTypeOf(find).toExtend<ReadOperationAst<typeof Article>>()
	expectTypeOf(find).toExtend<FindManyOperationAst<typeof Article>>()
	expectTypeOf(count).toExtend<CountOperationAst<typeof Article>>()
})
