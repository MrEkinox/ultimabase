import { describe, expect, it } from 'vitest'

import {
	getRuntimeContributionImplementation,
	preparedOperation,
} from './definitions.js'
import { UltimaBase } from '../application/ultima-base.js'

const articleSchema = UltimaBase.Schema.define({
	className: 'ContributionDefinitionArticle',
	fields: (field) => ({
		title: field.string({ required: true }),
	}),
})

describe('runtime contribution definitions', () => {
	it('normalizes immutable scope and operation metadata without running handlers', () => {
		let calls = 0
		const definition = preparedOperation({
			schema: articleSchema,
			handler: (input) => {
				calls += 1
				return { operation: input.operation }
			},
		})

		expect(calls).toBe(0)
		expect(Object.isFrozen(definition)).toBe(true)
		expect(Object.isFrozen(definition.operations)).toBe(true)
	})

	it('resolves only definitions created by the public factory', () => {
		expect(getRuntimeContributionImplementation({})).toBeUndefined()
		expect(getRuntimeContributionImplementation(null)).toBeUndefined()
	})

	it('fixes prepared contributions to schema-scoped singular updates', () => {
		const prepared = preparedOperation({
			schema: articleSchema,
			handler: ({ operation }) => ({ operation }),
		})

		expect(prepared).toStrictEqual({
			kind: 'prepared-operation',
			operations: ['update-one'],
			schema: articleSchema,
		})
		expect(getRuntimeContributionImplementation(prepared)).toMatchObject({
			kind: 'prepared-operation',
			operations: ['update-one'],
			schema: articleSchema,
		})
	})

	it('rejects malformed JavaScript contribution options', () => {
		const invalidCases: readonly {
			readonly create: () => unknown
			readonly message: string
		}[] = [
			{
				create: () =>
					preparedOperation({
						handler: () => undefined,
						extra: true,
					} as never),
				message: 'runtime contribution contains unknown key: extra',
			},
			{
				create: () => preparedOperation({ handler: true } as never),
				message: 'runtime contribution handler must be a function',
			},
			{
				create: () =>
					preparedOperation({
						schema: {},
						handler: () => undefined,
					} as never),
				message: 'runtime contribution schema must be a schema definition',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}
	})
})
