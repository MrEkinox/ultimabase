import { expectTypeOf, test } from 'vitest'

import { Schema, intField, stringField } from '../../schema/index.js'
import { applyUpdateExpressionToRecord } from './apply.js'
import { normalizeUpdateExpression } from './normalize.js'

test('preserves the exact logical record type', () => {
	const Post = Schema.define({
		className: 'AppliedUpdateTypePost',
		fields: { title: stringField(), views: intField() },
	})
	const current = { title: 'Current', views: 1 } as const
	const candidate = applyUpdateExpressionToRecord(
		Post,
		current,
		normalizeUpdateExpression(Post, { increment: { views: 1 } }),
	)

	expectTypeOf(candidate).toEqualTypeOf<Readonly<typeof current>>()
})
