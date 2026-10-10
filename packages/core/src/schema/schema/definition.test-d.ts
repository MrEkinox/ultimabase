import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	type SchemaCreateData,
	type SchemaItem,
	type SchemaResult,
} from '../index.js'

test('keeps the canonical package specialization boundary exact', () => {
	const Specialized = Schema.defineSpecialized(
		{
			className: 'TypedSpecializedPost',
			fields: (field) => ({ title: field.string() }),
		},
		// ADR-0310: specializations contribute statics only; results are data.
		() => ({ kind: 'specialized' as const }),
	)

	expectTypeOf(Specialized.className).toEqualTypeOf<'TypedSpecializedPost'>()
	expectTypeOf(Specialized.kind).toEqualTypeOf<'specialized'>()
	expectTypeOf<SchemaItem<typeof Specialized>['title']>().toEqualTypeOf<
		string | null
	>()
	expectTypeOf<SchemaCreateData<typeof Specialized>>().toEqualTypeOf<{
		title?: string | null
	}>()
	expectTypeOf<keyof SchemaResult<typeof Specialized>>().toEqualTypeOf<
		'createdAt' | 'id' | 'title' | 'updatedAt'
	>()
	void Specialized.findMany({ where: { title: { startsWith: 'Typed' } } })
	void Specialized.findMany({
		// @ts-expect-error -- Specialized schemas retain their exact source fields.
		where: { missing: { eq: true } },
	})

	// @ts-expect-error -- One specialization primitive replaces the statics-only path.
	void Schema.defineWithStatics
	// @ts-expect-error -- One specialization primitive replaces the former capabilities path.
	void Schema.defineWithCapabilities
	// @ts-expect-error -- Ordinary authoring belongs only to a configured application factory.
	void Schema.define
})
