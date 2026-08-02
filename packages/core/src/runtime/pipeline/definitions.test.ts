import { describe, expect, it } from 'vitest'

import {
	getRuntimePipelineStageImplementation,
	runtimePipelineStage,
} from './definitions.js'

describe('runtimePipelineStage', () => {
	it('retains immutable stage metadata without exposing or running its handler', () => {
		let calls = 0
		const definition = runtimePipelineStage({
			stage: 'commit',
			handler: () => {
				calls += 1
			},
		})

		// Contribution snapshots expose ownership metadata but never the executable handler.
		expect(definition).toStrictEqual({ stage: 'commit' })
		expect(Object.isFrozen(definition)).toBe(true)
		expect(calls).toBe(0)
		expect(getRuntimePipelineStageImplementation(definition)).toMatchObject({
			stage: 'commit',
		})
		expect(
			getRuntimePipelineStageImplementation({ stage: 'commit' }),
		).toBeUndefined()
		expect(getRuntimePipelineStageImplementation(null)).toBeUndefined()
	})

	it('rejects malformed JavaScript definitions at their declaration boundary', () => {
		const invalidCases: readonly {
			readonly create: () => unknown
			readonly message: string
		}[] = [
			{
				create: () => runtimePipelineStage(null as never),
				message: 'runtime pipeline stage options must be a plain object',
			},
			{
				create: () =>
					runtimePipelineStage({
						stage: 'normalization',
						handler: () => undefined,
						extra: true,
					} as never),
				message: 'runtime pipeline stage contains unknown key: extra',
			},
			{
				create: () =>
					runtimePipelineStage({
						stage: 'unknown',
						handler: () => undefined,
					} as never),
				message: 'Unknown runtime pipeline stage: unknown',
			},
			{
				create: () =>
					runtimePipelineStage({
						stage: 'normalization',
						handler: true,
					} as never),
				message: 'runtime pipeline stage handler must be a function',
			},
		]

		for (const invalidCase of invalidCases) {
			expect(invalidCase.create).toThrow(new TypeError(invalidCase.message))
		}
	})
})
