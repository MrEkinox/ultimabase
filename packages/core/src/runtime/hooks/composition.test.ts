import { describe, expect, it, vi } from 'vitest'

import {
	runHookEffects,
	runHookTransformChain,
	runHookValidations,
} from './composition.js'

describe('runtime hook composition', () => {
	it('feeds transform replacements forward while undefined preserves the value', async () => {
		const seen: number[] = []
		const result = await runHookTransformChain(
			['double', 'observe', 'increment'] as const,
			2,
			(handler, value) => {
				seen.push(value)

				if (handler === 'double') return value * 2
				if (handler === 'increment') return value + 1

				return undefined
			},
		)

		expect(seen).toStrictEqual([2, 4, 4])
		expect(result).toBe(5)
	})

	it('awaits each asynchronous transform before invoking the next', async () => {
		const trace: string[] = []
		const first = async (value: string): Promise<string> => {
			trace.push('first:start')
			await Promise.resolve()
			trace.push('first:end')

			return `${value}:first`
		}
		const second = (value: string): string => {
			trace.push('second')

			return `${value}:second`
		}

		const result = await runHookTransformChain(
			[first, second],
			'start',
			(handler, value) => handler(value),
		)

		expect(trace).toStrictEqual(['first:start', 'first:end', 'second'])
		expect(result).toBe('start:first:second')
	})

	it('aggregates all validation issues into a copied frozen array', async () => {
		const firstIssues = [
			{ code: 'hook.first', message: 'First issue', path: ['title'] },
		]
		const secondIssues = [
			{ code: 'hook.second', message: 'Second issue', path: [0] },
			{ code: 'hook.third', message: 'Third issue', path: ['profile', 1] },
		]
		const result = await runHookValidations(
			['first', 'none', 'second'] as const,
			(handler) => {
				if (handler === 'first') return firstIssues
				if (handler === 'second') return Promise.resolve(secondIssues)

				return undefined
			},
		)

		firstIssues[0]?.path.push('mutated')
		if (firstIssues[0] !== undefined) {
			firstIssues[0].message = 'Mutated issue'
		}
		secondIssues.splice(0, secondIssues.length)

		expect(result).toStrictEqual([
			{ code: 'hook.first', message: 'First issue', path: ['title'] },
			{ code: 'hook.second', message: 'Second issue', path: [0] },
			{
				code: 'hook.third',
				message: 'Third issue',
				path: ['profile', 1],
			},
		])
		expect(Object.isFrozen(result)).toBe(true)
		expect(result.every((issue) => Object.isFrozen(issue))).toBe(true)
		expect(result.every((issue) => Object.isFrozen(issue.path))).toBe(true)
	})

	it.each([
		{
			result: 'invalid',
			message:
				'Hook validation handler 0 must return an issue list or undefined',
		},
		{
			result: [null],
			message:
				'Hook validation handler 0 issue 0 must be a validation issue object',
		},
		{
			result: [{ code: 'custom', message: 'Invalid', path: [] }],
			message:
				'Hook validation handler 0 issue 0.code must be a namespaced issue code',
		},
		{
			result: [{ code: 'hook.invalid', message: '', path: [] }],
			message:
				'Hook validation handler 0 issue 0.message must be a non-empty string',
		},
		{
			result: [{ code: 'hook.invalid', message: 'Invalid', path: [-1] }],
			message:
				'Hook validation handler 0 issue 0.path must contain only property names or non-negative indexes',
		},
	] as const)(
		'rejects malformed validation results by path',
		async ({ result, message }) => {
			await expect(
				runHookValidations(['invalid'], () => result),
			).rejects.toThrow(new TypeError(message))
		},
	)

	it('executes asynchronous effects sequentially', async () => {
		const trace: string[] = []

		await runHookEffects(['first', 'second'] as const, async (handler) => {
			trace.push(`${handler}:start`)
			await Promise.resolve()
			trace.push(`${handler}:end`)
		})

		expect(trace).toStrictEqual([
			'first:start',
			'first:end',
			'second:start',
			'second:end',
		])
	})

	const shortCircuitCases = [
		[
			'transforms',
			(fail: () => never, later: () => void) =>
				runHookTransformChain(
					['fail', 'later'] as const,
					'initial',
					(handler, value) => {
						if (handler === 'fail') return fail()

						later()

						return value
					},
				),
		],
		[
			'validations',
			(fail: () => never, later: () => void) =>
				runHookValidations(['fail', 'later'] as const, (handler) => {
					if (handler === 'fail') return fail()

					later()

					return []
				}),
		],
		[
			'effects',
			(fail: () => never, later: () => void) =>
				runHookEffects(['fail', 'later'] as const, (handler) => {
					if (handler === 'fail') return fail()

					later()
				}),
		],
	] as const satisfies readonly (readonly [
		string,
		(fail: () => never, later: () => void) => Promise<unknown>,
	])[]

	it.each(shortCircuitCases)(
		'short-circuits %s after the first failure',
		async (_name, run) => {
			const failure = new Error('hook failed')
			const later = vi.fn()
			const fail = (): never => {
				throw failure
			}

			await expect(run(fail, later)).rejects.toBe(failure)

			expect(later).not.toHaveBeenCalled()
		},
	)
})
