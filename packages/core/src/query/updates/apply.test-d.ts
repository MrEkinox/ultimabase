import { expectTypeOf, test } from 'vitest'

import { Schema } from '../../schema/index.js'
import { applyUpdateExpressionToRecord } from './apply.js'
import { normalizeUpdateExpression } from './normalize.js'
import { increment } from './operators.js'

test('preserves the exact logical record type', () => {
	const Post = Schema.define({
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
