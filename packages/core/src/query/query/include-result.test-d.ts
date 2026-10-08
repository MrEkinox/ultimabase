import { expectTypeOf, test } from 'vitest'

import { UltimaBase, pointerField, type Pointer } from '../../index.js'

const IncludeAuthor = UltimaBase.Schema.define({
	className: 'IncludeAuthor',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

const IncludeArticle = UltimaBase.Schema.define({
	className: 'IncludeArticle',
	fields: (field) => ({
		author: pointerField({ target: () => IncludeAuthor }),
		editor: pointerField({ target: () => IncludeAuthor }),
		title: field.string({ required: true }),
	}),
})

const findWithAuthor = () =>
	IncludeArticle.findMany({
		include: { author: { select: { name: true } } },
		select: { editor: true, title: true },
	})

type Row = Awaited<ReturnType<typeof findWithAuthor>>[number]

// Regression: fields outside the include map used to become `never`.
test('keeps every non-included root field when a pointer is included', () => {
	expectTypeOf<Row['title']>().toEqualTypeOf<string>()
	expectTypeOf<Row['id']>().toBeString()
	expectTypeOf<Row['editor']>().toEqualTypeOf<Pointer<
		typeof IncludeAuthor
	> | null>()
})

// Regression: an included pointer missing from `select` was absent from the type,
// although the Runtime returns it.
test('adds an included pointer that the selection omits', () => {
	expectTypeOf<Row>().toHaveProperty('author')
	expectTypeOf<NonNullable<Row['author']>['name']>().toEqualTypeOf<string>()
	expectTypeOf<NonNullable<Row['author']>['id']>().toBeString()
})
