import { UltimaBase } from '@ultimabase/core'
import { expect, it } from 'vitest'

import { generateApplicationTypes } from './generator.js'

const generateDecimal = (shaped: boolean) => {
	const DecimalSchema = UltimaBase.Schema.define({
		className: 'TypegenDecimalShape',
		fields: (field) => ({
			amount: shaped
				? field.decimal({ precision: 12, scale: 2 })
				: field.decimal(),
		}),
	})

	return generateApplicationTypes({
		ultimabase: new UltimaBase({ schemas: [DecimalSchema] }),
		applicationId: 'fixture.decimal-shape',
	})
}

it('omits inert decimal precision and scale from generated contracts', () => {
	expect(generateDecimal(true)).toStrictEqual(generateDecimal(false))
})
