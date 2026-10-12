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
})
