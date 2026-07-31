import {
	booleanField,
	defineSchema,
	intField,
	stringField,
} from '@ultimabase/schema'
import { expectTypeOf, test } from 'vitest'

import type { InferQueryResult } from './bound-query.js'
import { Query } from './query.js'

const articleSchema = defineSchema({
	className: 'Article',
	fields: {
		title: stringField({ validation: { required: true } }),
		published: booleanField(),
		views: intField(),
	},
})

test('binds exact schema and selection types through an engine', () => {
	// The opaque fixture models the future RequestEngine without pre-implementing it.
	const engine = { kind: 'fake-request-engine' } as const
	const reusable = new Query(articleSchema).equalTo('published', true)
	const bound = reusable.bind(engine).select('id', 'title').limit(10)
	const projection: InferQueryResult<typeof articleSchema, 'id' | 'title'> = {
		id: 'article-id',
		title: 'Title',
	}

	expectTypeOf(bound.schema).toEqualTypeOf<typeof articleSchema>()
	expectTypeOf(bound.engine).toEqualTypeOf<typeof engine>()
	expectTypeOf(projection.id).toBeString()
	expectTypeOf(projection.title).toBeString()
	expectTypeOf<InferQueryResult<typeof articleSchema>>().toHaveProperty('views')

	// @ts-expect-error -- Selection remains restricted to the bound schema.
	bound.select('missing')
	// @ts-expect-error -- Bound filters retain field-specific value types.
	bound.equalTo('published', 'true')
	const invalidProjection: InferQueryResult<
		typeof articleSchema,
		'id' | 'title'
	> = {
		id: 'article-id',
		title: 'Title',
		// @ts-expect-error -- Future projected results cannot expose omitted fields.
		views: 1,
	}

	expectTypeOf(invalidProjection).toBeObject()
})
