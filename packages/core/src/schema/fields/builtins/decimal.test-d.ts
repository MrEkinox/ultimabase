import { expectTypeOf, test } from 'vitest'

import { decimalField, Schema } from '../../index.js'

test('types decimal shape as direct field metadata', () => {
	const direct = decimalField({ precision: 12, scale: 2 })

	expectTypeOf(direct.options.precision).toEqualTypeOf<number | undefined>()
	expectTypeOf(direct.options.scale).toEqualTypeOf<number | undefined>()

	decimalField({
		validation: {
			// @ts-expect-error -- Precision is no longer a nested value constraint.
			precision: 12,
		},
	})
	decimalField({
		// @ts-expect-error -- Direct decimal precision must be numeric.
		precision: '12',
	})

	Schema.define({
		className: 'DirectDecimalShapeTypes',
		fields: (field) => ({
			amount: field.decimal({ precision: 18, scale: 4 }),
		}),
	})
})
