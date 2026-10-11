import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'

import {
	normalizeSchemaValidation,
	runSchemaValidation,
} from './schema-validation.js'

const item = { endsAt: 1, startsAt: 3 }

// ADR-0319: a schema check is a function or a Standard Schema object validator.
describe('schema checks', () => {
	it('reads every result form of a check function', async () => {
		await expect(runSchemaValidation(() => true, item)).resolves.toStrictEqual(
			[],
		)
		await expect(
			runSchemaValidation(() => 'Ends before it starts', item),
		).resolves.toStrictEqual([
			{ code: 'schema.validation', message: 'Ends before it starts', path: [] },
		])
		await expect(
			runSchemaValidation(
				() => ({ code: 'range', message: 'Too early', path: ['endsAt'] }),
				item,
				[2],
			),
		).resolves.toStrictEqual([
			{ code: 'range', message: 'Too early', path: [2, 'endsAt'] },
		])
		await expect(
			runSchemaValidation(
				() =>
					Promise.resolve([
						{ message: 'First' },
						{ message: 'Second', path: ['startsAt'] },
					]),
				item,
			),
		).resolves.toStrictEqual([
			{ code: 'schema.validation', message: 'First', path: [] },
			{ code: 'schema.validation', message: 'Second', path: ['startsAt'] },
		])
	})

	it('runs a Standard Schema object validator on the item', async () => {
		const range: StandardSchemaV1<typeof item> = {
			'~standard': {
				validate: (value) =>
					typeof value === 'object' &&
					value !== null &&
					Reflect.get(value, 'endsAt') < Reflect.get(value, 'startsAt')
						? {
								issues: [
									{ message: 'Ends before it starts', path: ['endsAt'] },
								],
							}
						: { value: item },
				vendor: 'schema-check-test',
				version: 1,
			},
		}

		await expect(runSchemaValidation(range, item)).resolves.toStrictEqual([
			{
				code: 'schema.validation',
				message: 'Ends before it starts',
				path: ['endsAt'],
			},
		])
	})

	it('rejects malformed results and declarations', async () => {
		await expect(runSchemaValidation(() => 42, item)).rejects.toMatchObject({
			code: 'INTERNAL_ERROR',
		})
		await expect(
			runSchemaValidation(() => [{ path: ['x'] }], item),
		).rejects.toThrow('A schema check must return true, a message, or issues')
		expect(() => normalizeSchemaValidation({})).toThrow(
			'validation must be a Standard Schema V1 validator or a function',
		)
	})
})
