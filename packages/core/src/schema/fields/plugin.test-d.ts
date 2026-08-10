import { expectTypeOf, test } from 'vitest'

import { definePluginField, type FieldDefinition } from '../index.js'

const snapshotValue = (value: unknown, path: string): string => {
	if (typeof value !== 'string') {
		throw new TypeError(`${path} must be a string`)
	}

	return value
}

test('keeps plugin field options on the primary call contract', () => {
	const field = definePluginField(
		'fixture.diagnostic',
		{ list: true, default: ['first'] },
		{ snapshotValue },
	)

	expectTypeOf(field).toExtend<FieldDefinition<'fixture.diagnostic', string>>()

	definePluginField(
		'fixture.invalid-default',
		// @ts-expect-error -- List plugin defaults must provide a list value.
		{ list: true, default: 'first' },
		{ snapshotValue },
	)

	definePluginField(
		'fixture.invalid-nullability',
		{
			validation: {
				// @ts-expect-error -- Nullability is derived for plugin fields too.
				nullable: true,
			},
		},
		{ snapshotValue },
	)
})
