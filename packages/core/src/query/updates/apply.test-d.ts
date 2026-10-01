import { expectTypeOf, test } from 'vitest'

import { applyUpdateExpressionToRecord } from './apply.js'
import { normalizeUpdateExpression } from './normalize.js'
import { increment } from './operators.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

test('preserves the exact logical record type', () => {
	const Post = UltimaBase.Schema.define({
		className: 'AppliedUpdateTypePost',
		fields: (field) => ({ title: field.string(), views: field.int() }),
	})
	const current = { title: 'Current', views: 1 } as const
	const candidate = applyUpdateExpressionToRecord(
		Post,
		current,
		normalizeUpdateExpression(Post, { views: increment(1) }),
	)

	expectTypeOf(candidate).toEqualTypeOf<Readonly<typeof current>>()
})
