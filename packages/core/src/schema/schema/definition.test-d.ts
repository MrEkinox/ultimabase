import { expectTypeOf, test } from 'vitest'

import { Schema, type SchemaResult } from '../index.js'

test('keeps the canonical package specialization boundary exact', () => {
	const Specialized = Schema.defineSpecialized(
		{
			className: 'TypedSpecializedPost',
			fields: (field) => ({ title: field.string() }),
		},
		() => ({
			results: {
				archive(this: object): 'archived' {
					return 'archived'
				},
			},
			statics: { kind: 'specialized' as const },
		}),
	)

	expectTypeOf(Specialized.className).toEqualTypeOf<'TypedSpecializedPost'>()
	expectTypeOf(Specialized.kind).toEqualTypeOf<'specialized'>()
	expectTypeOf<SchemaResult<typeof Specialized>['archive']>().toBeFunction()

	// @ts-expect-error -- One specialization primitive replaces the statics-only path.
	void Schema.defineWithStatics
	// @ts-expect-error -- One specialization primitive replaces the former capabilities path.
	void Schema.defineWithCapabilities
})
