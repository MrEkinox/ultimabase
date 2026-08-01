import { stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { postgresColumn, resolvePostgresRenamedFrom } from './column.js'

describe('postgresColumn', () => {
	it('preserves an exact previous physical identifier', () => {
		const extension = postgresColumn({ renamedFrom: 'Legacy title' })
		const field = stringField({ extensions: [extension] })

		expect(resolvePostgresRenamedFrom(field)).toBe('Legacy title')
		expect(Object.isFrozen(extension.config)).toBe(true)
	})

	it('rejects malformed JavaScript configuration', () => {
		expect(() => postgresColumn({ renamedFrom: '' })).toThrow(
			new TypeError('postgres column renamedFrom must be a non-empty string'),
		)
		expect(() =>
			postgresColumn({ renamedFrom: 'title', extra: true } as never),
		).toThrow(new TypeError('postgres column contains unknown key: extra'))
	})
})
