import { describe, expect, it } from 'vitest'

import { splitFieldAccessOptions } from './field-options.js'

describe('splitFieldAccessOptions', () => {
	it('preserves option identity when no Access declaration exists', () => {
		const options = { required: true }
		const result = splitFieldAccessOptions(options)

		expect(result).toEqual({ access: undefined, metadataOptions: options })
		expect(result.metadataOptions).toBe(options)
	})

	it('extracts and normalizes Access without retaining it as field metadata', () => {
		const result = splitFieldAccessOptions({
			access: { read: true },
			required: true,
		})

		expect(result).toEqual({
			access: { read: true },
			metadataOptions: { required: true },
		})
	})

	it('rejects non-object field options', () => {
		expect(() => splitFieldAccessOptions(null as never)).toThrow(
			'field options must be an object',
		)
	})
})
