import { Schema, stringField } from '../../schema/index.js'
import { describe, expect, it } from 'vitest'

import {
	afterOperation,
	beforeOperation,
	getRuntimeContributionImplementation,
	postCommitEvent,
} from './definitions.js'

const articleSchema = new Schema({
	className: 'HookDefinitionArticle',
	fields: { title: stringField({ validation: { required: true } }) },
})

describe('runtime contribution definitions', () => {
	it('normalizes immutable scope and operation metadata without running handlers', () => {
		let calls = 0
		const definition = beforeOperation({
			schema: articleSchema,
			operations: ['create-one', 'create-one', 'update-one'],
			handler: (input) => {
				calls += 1

				return { operation: input.operation }
			},
		})

		expect(definition).toStrictEqual({
			kind: 'before-operation',
			schema: articleSchema,
			operations: ['create-one', 'update-one'],
		})
		expect(calls).toBe(0)
		expect(Object.isFrozen(definition)).toBe(true)
		expect(Object.isFrozen(definition.operations)).toBe(true)
		expect(getRuntimeContributionImplementation(definition)).toMatchObject({
			kind: 'before-operation',
			schema: articleSchema,
			operations: ['create-one', 'update-one'],
		})
	})

	it('distinguishes after-hooks and post-commit event definitions', () => {
		const after = afterOperation({
			handler: (input) => ({ result: input.result }),
		})
		const event = postCommitEvent({ handler: () => undefined })

		expect(after).toStrictEqual({
			kind: 'after-operation',
			schema: undefined,
			operations: undefined,
		})
		expect(event).toStrictEqual({
			kind: 'post-commit-event',
			schema: undefined,
			operations: undefined,
		})
		expect(getRuntimeContributionImplementation({})).toBeUndefined()
		expect(getRuntimeContributionImplementation(null)).toBeUndefined()
	})

	it('rejects malformed JavaScript contribution options', () => {
		const invalidCases: readonly {
			readonly create: () => unknown
			readonly message: string
		}[] = [
			{
				create: () => beforeOperation(null as never),
				message: 'runtime contribution options must be a plain object',
			},
			{
				create: () =>
					beforeOperation({
						handler: () => ({ operation: null }),
						extra: true,
					} as never),
				message: 'runtime contribution contains unknown key: extra',
			},
			{
				create: () => beforeOperation({ handler: true } as never),
				message: 'runtime contribution handler must be a function',
			},
			{
				create: () =>
					beforeOperation({ schema: {}, handler: () => undefined } as never),
				message: 'runtime contribution schema must be a schema definition',
			},
			{
				create: () =>
					beforeOperation({
						operations: [],
						handler: () => undefined,
					} as never),
				message: 'runtime contribution operations must be a non-empty array',
			},
			{
				create: () =>
					beforeOperation({
						operations: 'create-one',
						handler: () => undefined,
					} as never),
				message: 'runtime contribution operations must be a non-empty array',
			},
			{
				create: () =>
					beforeOperation({
						operations: ['save'],
						handler: () => undefined,
					} as never),
				message: 'Unknown runtime operation kind: save',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}
	})
})
