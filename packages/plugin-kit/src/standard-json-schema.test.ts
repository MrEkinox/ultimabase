import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { readStandardJsonSchema } from './standard-json-schema.js'

describe('readStandardJsonSchema', () => {
	it('reads the input and output schema of a Standard JSON Schema validator', () => {
		const validator = z.object({ count: z.number().int().optional() })

		expect(readStandardJsonSchema(validator, 'input')).toMatchObject({
			properties: { count: { type: 'integer' } },
			type: 'object',
		})
		expect(readStandardJsonSchema(validator, 'input')).not.toHaveProperty(
			'$schema',
		)
		expect(readStandardJsonSchema(validator, 'output')).toMatchObject({
			type: 'object',
		})
	})

	it('answers undefined for a value that cannot describe itself', () => {
		expect(readStandardJsonSchema(undefined, 'input')).toBeUndefined()
		expect(readStandardJsonSchema({ '~standard': {} }, 'input')).toBeUndefined()
		expect(
			readStandardJsonSchema(
				{
					'~standard': {
						jsonSchema: {
							input: () => {
								throw new Error('not describable')
							},
						},
					},
				},
				'input',
			),
		).toBeUndefined()
	})

	// Converters answer arbitrary values: only plain JSON is passed on.
	const describing = (schema: unknown) => ({
		'~standard': { jsonSchema: { input: () => schema } },
	})

	it('keeps nested JSON objects and arrays, without $schema', () => {
		expect(
			readStandardJsonSchema(
				describing({
					$schema: 'https://json-schema.org/draft/2020-12/schema',
					properties: { mode: { enum: ['review', 1, true, null] } },
					required: ['mode'],
					type: 'object',
				}),
				'input',
			),
		).toStrictEqual({
			properties: { mode: { enum: ['review', 1, true, null] } },
			required: ['mode'],
			type: 'object',
		})
	})

	it.for([
		['a top-level array', ['string']],
		['a non-finite number', { maximum: Number.POSITIVE_INFINITY }],
		['an undefined array item', { enum: ['a', undefined] }],
		['a function', { default: () => 'a' }],
		['a class instance', { default: new Date(0) }],
	] as const)('answers undefined for %s', ([, schema]) => {
		expect(readStandardJsonSchema(describing(schema), 'input')).toBeUndefined()
	})

	it('reads each direction from the converter it belongs to', () => {
		const converter = Object.assign(() => undefined, {
			type: 'string',
			input(this: { readonly type: string }) {
				return { type: this.type }
			},
		})
		const validator = { '~standard': { jsonSchema: converter } }
		expect(readStandardJsonSchema(validator, 'input')).toStrictEqual({
			type: 'string',
		})
		// No output converter: the output stays undocumented.
		expect(readStandardJsonSchema(validator, 'output')).toBeUndefined()
		expect(
			readStandardJsonSchema({ '~standard': () => undefined }, 'input'),
		).toBeUndefined()
	})
})
