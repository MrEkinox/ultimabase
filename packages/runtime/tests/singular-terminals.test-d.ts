import type { UserRequestAccess } from '@ultimabase/access'
import {
	intField,
	stringField,
	defineSchema,
	type InferObject,
} from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import type { RequestContext } from '../src/context/request-context.js'
import type { RequestEngine } from '../src/engine/framework-engine.js'

const articleSchema = defineSchema({
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
		Promise<readonly { readonly id: string; readonly title: string }[]>
	>()
	expectTypeOf(query.first()).toEqualTypeOf<
		Promise<{ readonly id: string; readonly title: string } | null>
	>()
	expectTypeOf(query.get('article-1')).toEqualTypeOf<
		Promise<{ readonly id: string; readonly title: string } | null>
	>()
	expectTypeOf(query.count()).toEqualTypeOf<Promise<number>>()
	expectTypeOf(query.exists()).toEqualTypeOf<Promise<boolean>>()
	expectTypeOf(query.createOne({ title: 'Created' })).toEqualTypeOf<
		Promise<InferObject<typeof articleSchema>>
	>()
	expectTypeOf(query.create({ title: 'Created' })).toEqualTypeOf<
		Promise<InferObject<typeof articleSchema>>
	>()
	expectTypeOf(query.updateOne({ increment: { views: 1 } })).toEqualTypeOf<
		Promise<{ readonly id: string; readonly title: string } | null>
	>()
	expectTypeOf(query.deleteOne()).toEqualTypeOf<
		Promise<{ readonly id: string; readonly title: string } | null>
	>()
})
