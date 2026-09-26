import { describe, expect, it } from 'vitest'

import { readRuntimePreparedMutationRecords } from '../../index.js'

describe('prepared mutation target boundary', () => {
	it('accepts absent and logical record targets', () => {
		const target = { id: 'article-1', title: 'Draft' }

		expect(readRuntimePreparedMutationRecords({})).toEqual({
			target: undefined,
		})
		expect(
			readRuntimePreparedMutationRecords({ target: null }).target,
		).toBeNull()
		expect(readRuntimePreparedMutationRecords({ target }).target).toBe(target)
	})

	it('snapshots a validated logical record collection', () => {
		const target = { id: 'article-1' }
		const source = [target]
		const records = readRuntimePreparedMutationRecords({ targets: source })

		expect(records.targets).toEqual(source)
		expect(records.targets).not.toBe(source)
		expect(Object.isFrozen(records.targets)).toBe(true)
		expect(Object.isFrozen(records)).toBe(true)
	})

	it('rejects invalid singular and collection values', () => {
		expect(() =>
			readRuntimePreparedMutationRecords({ target: 'article-1' }),
		).toThrow('Runtime prepared mutation target must be a logical record')
		expect(() =>
			readRuntimePreparedMutationRecords({
				targets: [{ id: 'article-1' }, null],
			}),
		).toThrow('Runtime prepared mutation targets must be logical records')
		expect(() => readRuntimePreparedMutationRecords(undefined)).toThrow(
			'Runtime prepared mutation input must be an object',
		)
	})
})
