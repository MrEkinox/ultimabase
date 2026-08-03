import type { UserRequestAccess } from '../../src/index.js'
import {
	intField,
	stringField,
	Schema,
	type InferQueryResult,
} from '../../src/index.js'
import { expectTypeOf, test } from 'vitest'

import type { RequestContext } from '../../src/runtime/context/request-context.js'
import type { RequestEngine } from '../../src/runtime/engine/framework-engine.js'

const articleSchema = Schema.define({
	className: 'TypedTerminalArticle',
	fields: {
		title: stringField({ validation: { required: true } }),
		views: intField(),
	},
})

declare const request: RequestEngine<
	readonly [typeof articleSchema],
	readonly [],
	RequestContext<UserRequestAccess<'user-1'>, 'internal'>
>

test('preserves RequestEngine schema selection across every singular terminal', () => {
	const query = request.query(articleSchema).select('id', 'title')

	expectTypeOf(query.find()).toEqualTypeOf<
		Promise<readonly InferQueryResult<typeof articleSchema, 'id' | 'title'>[]>
	>()
	expectTypeOf(query.first()).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.get('article-1')).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.count()).toEqualTypeOf<Promise<number>>()
	expectTypeOf(query.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(query.createOne({ title: 'Created' })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema>>
	>()
	expectTypeOf(query.create({ title: 'Created' })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema>>
	>()
	expectTypeOf(query.updateOne({ increment: { views: 1 } })).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
	expectTypeOf(query.deleteOne()).toEqualTypeOf<
		Promise<InferQueryResult<typeof articleSchema, 'id' | 'title'> | null>
	>()
})
