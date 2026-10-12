import type { StandardSchemaV1 } from '@standard-schema/spec'
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'

import { UltimaBase } from '@ultimabase/core'

import { validationPlugin } from '../src/plugin.js'

const App = UltimaBase.use(validationPlugin())

// ADR-0319: transforms, null inputs, function validators and schema checks.
test('types field validators against the field value', () => {
	App.Schema.define({
		className: 'TypedFieldValidators',
		fields: (field) => ({
			// The output is stored: a trimming validator keeps a string.
			title: field.string({ validation: z.string().trim().max(200) }),
			// A form validator accepting null is reused as is.
			note: field.string({ validation: z.string().min(2).nullable() }),
			code: field.string({
				validation: (value) => {
					expectTypeOf(value).toEqualTypeOf<string>()
					return (
						value.length === 3 || {
							code: 'code.length',
							message: 'Three letters',
						}
					)
				},
			}),
			room: field.string({
				validation: async (value) => {
					await Promise.resolve()
					return value !== 'closed' || 'Closed room'
				},
			}),
			length: field.string({
				// @ts-expect-error -- The output must remain storable in the field.
				validation: z.string().transform((v) => v.length),
			}),
			// @ts-expect-error -- The validator must accept the field's value.
			count: field.int({ validation: z.string() }),
		}),
	})
})

test('types the schema check on the complete item', () => {
	App.Schema.define({
		className: 'TypedSchemaCheck',
		fields: (field) => ({
			startsAt: field.int({ required: true }),
			endsAt: field.int({ required: true }),
		}),
	}).with({
		validation: ({ item }) => {
			expectTypeOf(item.startsAt).toEqualTypeOf<number>()
			return (
				item.endsAt >= item.startsAt || {
					message: 'Ends before it starts',
					path: ['endsAt'],
				}
			)
		},
	})

	App.Schema.define({
		className: 'TypedSchemaValidator',
		fields: (field) => ({ low: field.int({ required: true }) }),
	}).with({
		validation: z.object({ low: z.number() }) satisfies StandardSchemaV1,
	})

	App.Schema.define({
		className: 'TypedSchemaIssues',
		fields: (field) => ({ low: field.int({ required: true }) }),
	}).with({
		validation: () => [
			{ message: 'First' },
			{ message: 'Second', path: ['low'] },
		],
	})
})
