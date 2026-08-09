import { expectTypeOf, test } from 'vitest'

import type {
	GeneratedEqualityWhere,
	GeneratedOrderBy,
	GeneratedRelationWhere,
	GeneratedSelect,
	GeneratedWhereBranches,
} from '../index.js'

interface ExampleWhere extends GeneratedWhereBranches<ExampleWhere> {
	readonly title?: GeneratedEqualityWhere<string>
}

test('keeps generated shared operators named and exact', () => {
	const where = {
		AND: [{ title: { eq: 'first' } }],
		NOT: { title: { ne: 'hidden' } },
		title: { in: ['first', 'second'] },
	} as const satisfies ExampleWhere
	const relation = {
		count: { gte: 3, where },
		some: where,
	} as const satisfies GeneratedRelationWhere<ExampleWhere>
	const select = { id: true, title: false } as const satisfies GeneratedSelect<
		'id' | 'title'
	>
	const order = { title: 'asc' } as const satisfies GeneratedOrderBy<
		'id' | 'title'
	>

	expectTypeOf(where.title.in).toEqualTypeOf<readonly ['first', 'second']>()
	expectTypeOf(relation.count.gte).toEqualTypeOf<3>()
	expectTypeOf(select.id).toEqualTypeOf<true>()
	expectTypeOf(order.title).toEqualTypeOf<'asc'>()

	// @ts-expect-error -- Shared selection contracts reject unknown fields.
	const invalidSelect: GeneratedSelect<'id'> = { missing: true }
	const invalidOrder: GeneratedOrderBy<'id' | 'title'> = {
		id: 'asc',
		// @ts-expect-error -- Shared order contracts accept exactly one field per object.
		title: 'desc',
	}

	void invalidOrder
	void invalidSelect
})
