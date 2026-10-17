import { UltimaBase } from '@ultimabase/core'
import { describe, expect, it } from 'vitest'

import { describeSchemaComponents } from './openapi-schemas.js'

// Regression (ADR-0340): the OpenAPI document derived nullability from a
// literal `required: true`, so a defaulted field, which is required, was
// described as accepting and returning `null`.
const Order = UltimaBase.Schema.define({
	className: 'OpenApiRequiredOrder',
	fields: (field) => ({
		status: field.string({ default: 'pending' }),
		coupon: field.string({ default: 'WELCOME', required: false }),
		note: field.string(),
	}),
})

describe('OpenAPI field nullability', () => {
	it('follows required, which a default makes true unless required: false', () => {
		const components = describeSchemaComponents(Order)
		const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] }

		for (const name of [
			'OpenApiRequiredOrder',
			'OpenApiRequiredOrderCreateInput',
			'OpenApiRequiredOrderUpdateInput',
		]) {
			expect(components[name]).toMatchObject({
				properties: {
					coupon: nullableString,
					note: nullableString,
					status: { type: 'string' },
				},
			})
		}
		expect(components.OpenApiRequiredOrderCreateInput).not.toHaveProperty(
			'required',
		)
	})
})
